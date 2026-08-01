//! Republish a NIP-34 repo announcement (kind:30617) with buzz-channel + clone tags.
use futures_util::{SinkExt, StreamExt};
use nostr::{ClientMessage, EventBuilder, Keys, Kind, RelayMessage, RelayUrl, Tag, Timestamp};
use tokio_tungstenite::{connect_async, tungstenite::Message};

async fn send_msg<S>(ws: &mut S, msg: &ClientMessage) -> Result<(), Box<dyn std::error::Error>>
where
    S: SinkExt<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::error::Error + 'static,
{
    ws.send(Message::Text(serde_json::to_string(msg)?)).await?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let relay_ws = std::env::var("RELAY_WS")?;
    let relay_url = RelayUrl::parse(&relay_ws)?;
    let private_key = std::env::var("BUZZ_PRIVATE_KEY")?;
    let keys = Keys::parse(private_key.trim())?;

    let repo_id = std::env::var("REPO_ID")?;
    let repo_name = std::env::var("REPO_NAME").unwrap_or_else(|_| repo_id.clone());
    let description = std::env::var("REPO_DESCRIPTION").unwrap_or_default();
    let clone_url = std::env::var("CLONE_URL")?;
    let web_url = std::env::var("WEB_URL").unwrap_or_default();
    let channel_id = std::env::var("CHANNEL_ID")?;
    let created_at: u64 = std::env::var("CREATED_AT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        });

    let mut tags = vec![
        Tag::parse(["d", &repo_id])?,
        Tag::parse(["name", &repo_name])?,
        Tag::parse(["clone", &clone_url])?,
        Tag::parse(["buzz-channel", &channel_id])?,
        Tag::parse(["buzz-visibility", "listed"])?,
    ];
    if !description.is_empty() {
        tags.push(Tag::parse(["description", &description])?);
    }
    if !web_url.is_empty() {
        tags.push(Tag::parse(["web", &web_url])?);
    }

    let (mut ws, _) = connect_async(&relay_ws).await?;

    // Wait for AUTH challenge (Buzz relays require NIP-42).
    let mut authed = false;
    while let Some(msg) = ws.next().await {
        let msg = msg?;
        if !msg.is_text() {
            continue;
        }
        let relay_msg: RelayMessage = serde_json::from_str(msg.to_text()?)?;
        match relay_msg {
            RelayMessage::Auth { challenge } => {
                let auth_event =
                    EventBuilder::auth(challenge, relay_url.clone()).sign_with_keys(&keys)?;
                send_msg(&mut ws, &ClientMessage::auth(auth_event)).await?;
                authed = true;
            }
            RelayMessage::Ok { .. } if authed => break,
            RelayMessage::Notice { message } => eprintln!("notice: {message}"),
            _ => {}
        }
        if authed {
            // Some relays don't OK the AUTH; proceed after signing.
            break;
        }
    }

    let event = EventBuilder::new(Kind::Custom(30617), &description)
        .tags(tags)
        .custom_created_at(Timestamp::from(created_at))
        .sign_with_keys(&keys)?;
    let event_id = event.id;
    send_msg(&mut ws, &ClientMessage::event(event)).await?;

    while let Some(msg) = ws.next().await {
        let msg = msg?;
        if !msg.is_text() {
            continue;
        }
        let relay_msg: RelayMessage = serde_json::from_str(msg.to_text()?)?;
        match relay_msg {
            RelayMessage::Ok {
                event_id: ok_id,
                status,
                message,
            } if ok_id == event_id => {
                if status {
                    println!("OK {ok_id}");
                    return Ok(());
                }
                eprintln!("REJECTED {message}");
                std::process::exit(1);
            }
            RelayMessage::Notice { message } => eprintln!("notice: {message}"),
            _ => {}
        }
    }

    eprintln!("NO_OK_FROM_RELAY");
    std::process::exit(2);
}
