use futures_util::{SinkExt, StreamExt};
use nostr::{ClientMessage, EventBuilder, Filter, Keys, Kind, RelayMessage, RelayUrl, SubscriptionId};
use tokio_tungstenite::{connect_async, tungstenite::Message};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
 let _ = rustls::crypto::ring::default_provider().install_default();
 let relay_ws = std::env::var("RELAY_WS")?;
 let relay_url = RelayUrl::parse(&relay_ws)?;
 let keys = Keys::parse(std::env::var("BUZZ_PRIVATE_KEY")?.trim())?;
 let (mut ws, _) = connect_async(&relay_ws).await?;
 let bootstrap = ClientMessage::req(SubscriptionId::new("boot"), vec![Filter::new().kind(Kind::Custom(39000)).limit(1)]);
 ws.send(Message::Text(serde_json::to_string(&bootstrap)?)).await?;
 for _ in 0..12 {
   match ws.next().await {
    Some(Ok(Message::Text(t))) => {
      println!("IN {t}");
      let parsed: Result<RelayMessage,_> = serde_json::from_str(&t);
      if let Ok(RelayMessage::Auth{challenge}) = parsed {
        let auth_event = EventBuilder::auth(challenge, relay_url.clone()).sign_with_keys(&keys)?;
        let auth = ClientMessage::auth(auth_event);
        let txt = serde_json::to_string(&auth)?;
        println!("OUT {txt}");
        ws.send(Message::Text(txt)).await?;
      }
    }
    Some(Ok(other)) => println!("IN_OTHER {:?}", other),
    Some(Err(e)) => { println!("ERR {e:?}"); break; }
    None => { println!("NONE"); break; }
   }
 }
 Ok(())
}
