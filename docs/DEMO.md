# Greenlight v2: 3-minute demo script

Open https://oauth-greenlight-v2.vercel.app in a clean window. Keep a second tab on `/guide/gmail?need=signin,send` as a fallback.

**0:00 – The problem (15s)**
"If you're building an agent, your users connect Gmail or Salesforce through *your* OAuth app. Creating it takes five minutes. Getting it approved takes zero days to six months, and the scopes you ask for decide which. Nobody tells you which one you're in."

**0:15 – The board (20s)**
Point at the board. "Every app on Composio's OAuth list, as a departure board. Sort by time to live." Click the column header. "GitHub: same day. Gmail: five weeks to two months. The orange is the only colour on the page and it only means one thing: something is slow."

**0:35 – Two keystrokes to an answer (35s)**
Press `/`, type `gma`, Enter.
"One sentence: read email, five weeks to two months, and the long pole is the CASA security assessment. Three numbers. And the runway: what the agent can do, what only you can do, and where you're just waiting on Google." Hover a bar: "Numbers match the checklist below."

**1:10 – Scopes decide the wait (30s)**
Untick *Read email*, tick *Send email only*.
"Same provider. Send-only is a sensitive scope, not restricted: no CASA. Two to three weeks." Tick *Read email* back. "This is the insight the whole product is built on: you pick what the agent needs, not a provider."

**1:40 – The fast lane (15s)**
Point at the Fast lane strip. "Composio already runs an approved Gmail app, so you can skip all of this today. The trade-off is Composio's name on the consent screen. Greenlight says that honestly."

**1:55 – Do, don't tell (30s)**
Click *Get setup kit*.
"Everything an agent can produce right now: exact redirect URIs including Composio's callback, the least-privilege scope list, a scope-justification draft with Google's Limited Use language, a privacy checklist, the demo-video shot list, an email to Google, and a handoff prompt for Claude Code that stops where a human has to sign in or pay." Click Copy on the handoff prompt, then Download .md. Close.

**2:25 – Anything not on the board (25s)**
Press `/`, type `pipedrive`, Enter.
"Not curated, so an agent investigates it live, in the same layout. It checks Composio's directory, probes the OAuth server, finds the developer portal and reads it." Point at the log. "This deployment has no model key, so it stops before writing the guide and says exactly why. With a free Gemini or Groq key it writes the full guide and the link carries it."

**2:50 – Close (10s)**
"Sixteen guides, a hundred apps, every claim marked tested, sourced or uncertain, and a verification log of what changed since v1. The same data is Composio's backlog: every BYO-app row with a long wait is a toolkit worth getting managed approval for."
