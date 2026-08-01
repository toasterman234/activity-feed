use futures_util::{SinkExt, StreamExt};
use nostr::{Alphabet, ClientMessage, EventBuilder, Filter, Keys, Kind, RelayMessage, RelayUrl, SingleLetterTag, SubscriptionId, Tag};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

fn tag_value<'a>(event: &'a nostr::Event, key: &str) -> Option<&'a str> {
    event.tags.iter().find_map(|t| {
        let s = t.as_slice();
        if s.len() >= 2 && s[0] == key { Some(s[1].as_str()) } else { None }
    })
}

async fn send_text<S>(ws: &mut S, text: String) -> Result<(), Box<dyn std::error::Error>>
where
    S: SinkExt<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::error::Error + 'static,
{
    ws.send(Message::Text(text)).await?;
    Ok(())
}

async fn send_msg<S>(ws: &mut S, msg: &ClientMessage) -> Result<(), Box<dyn std::error::Error>>
where
    S: SinkExt<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::error::Error + 'static,
{
    send_text(ws, serde_json::to_string(msg)?).await
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let relay_ws = std::env::var("RELAY_WS")?;
    let relay_url = RelayUrl::parse(&relay_ws)?;
    let private_key = std::env::var("BUZZ_PRIVATE_KEY")?;
    let keys = Keys::parse(private_key.trim())?;

    let (mut ws, _) = connect_async(&relay_ws).await?;

    let bootstrap_sub = SubscriptionId::new("bootstrap-auth");
    let bootstrap_filter = Filter::new().kind(Kind::Custom(39000)).limit(1);
    send_msg(&mut ws, &ClientMessage::req(bootstrap_sub.clone(), vec![bootstrap_filter])).await?;

    let check_sub = SubscriptionId::new("check-experiments");
    let mut existing_match: Option<String> = None;
    let mut authed = false;
    let mut sent_check = false;

    while let Some(msg) = ws.next().await {
        let msg = msg?;
        if !msg.is_text() { continue; }
        let relay_msg: RelayMessage = serde_json::from_str(msg.to_text()?)?;
        match relay_msg {
            RelayMessage::Auth { challenge } => {
                let auth_event = EventBuilder::auth(challenge, relay_url.clone()).sign_with_keys(&keys)?;
                send_msg(&mut ws, &ClientMessage::auth(auth_event)).await?;
                authed = true;
            }
            RelayMessage::Ok { .. } if authed && !sent_check => {
                let filter = Filter::new().kind(Kind::Custom(39000)).limit(500);
                send_msg(&mut ws, &ClientMessage::req(check_sub.clone(), vec![filter])).await?;
                sent_check = true;
            }
            RelayMessage::Event { subscription_id, event } if subscription_id == check_sub => {
                let name = tag_value(&event, "name");
                let channel_type = tag_value(&event, "channel_type");
                let visibility = tag_value(&event, "visibility");
                if name == Some("experiments") && channel_type == Some("forum") && visibility == Some("private") {
                    existing_match = tag_value(&event, "d").map(|s| s.to_string()).or_else(|| tag_value(&event, "h").map(|s| s.to_string()));
                }
            }
            RelayMessage::EndOfStoredEvents(sub_id) if sub_id == check_sub => {
                send_msg(&mut ws, &ClientMessage::close(check_sub.clone())).await?;
                break;
            }
            RelayMessage::Closed { subscription_id, .. } if subscription_id == bootstrap_sub => {}
            RelayMessage::Notice { .. } => {}
            _ => {}
        }
    }

    if let Some(id) = existing_match {
        println!("EXISTS {id}");
        return Ok(());
    }

    let channel_id = Uuid::new_v4();
    let create_event = EventBuilder::new(Kind::Custom(9007), "")
        .tags(vec![
            Tag::parse(["h", &channel_id.to_string()])?,
            Tag::parse(["name", "experiments"] )?,
            Tag::parse(["visibility", "private"] )?,
            Tag::parse(["channel_type", "forum"] )?,
            Tag::parse(["about", "Track downloaded repos, evals, prototypes, and other experimental work."] )?,
        ])
        .sign_with_keys(&keys)?;
    let create_id = create_event.id;
    send_msg(&mut ws, &ClientMessage::event(create_event)).await?;

    let verify_sub = SubscriptionId::new("verify-experiments");
    let mut saw_ok = false;
    let mut saw_verify = false;

    while let Some(msg) = ws.next().await {
        let msg = msg?;
        if !msg.is_text() { continue; }
        let relay_msg: RelayMessage = serde_json::from_str(msg.to_text()?)?;
        match relay_msg {
            RelayMessage::Ok { event_id, status, message } if event_id == create_id => {
                if !status {
                    eprintln!("CREATE_FAILED {message}");
                    std::process::exit(1);
                }
                saw_ok = true;
                let filter = Filter::new()
                    .kind(Kind::Custom(39000))
                    .custom_tag(SingleLetterTag::lowercase(Alphabet::D), vec![channel_id.to_string()])
                    .limit(1);
                send_msg(&mut ws, &ClientMessage::req(verify_sub.clone(), vec![filter])).await?;
            }
            RelayMessage::Event { subscription_id, event } if subscription_id == verify_sub => {
                let name = tag_value(&event, "name");
                let channel_type = tag_value(&event, "channel_type");
                let visibility = tag_value(&event, "visibility");
                if name == Some("experiments") && channel_type == Some("forum") && visibility == Some("private") {
                    saw_verify = true;
                }
            }
            RelayMessage::EndOfStoredEvents(sub_id) if sub_id == verify_sub => {
                send_msg(&mut ws, &ClientMessage::close(verify_sub.clone())).await?;
                break;
            }
            RelayMessage::Notice { .. } => {}
            _ => {}
        }
    }

    if saw_ok && saw_verify {
        println!("CREATED {}", channel_id);
        Ok(())
    } else if saw_ok {
        eprintln!("CREATED_BUT_NOT_VERIFIED {}", channel_id);
        std::process::exit(2);
    } else {
        eprintln!("NO_OK_FROM_RELAY");
        std::process::exit(3);
    }
}
