/**
 * Styled 404 Not Found page featuring Pip, the SettleUp mascot.
 * Registered as Fastify's setNotFoundHandler to catch all unmatched routes.
 */
export function notFoundPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page Not Found — SettleUp</title>
<meta name="description" content="The page you're looking for doesn't exist.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#F5F4F7;--surface:#FFFFFF;--border:#E1DDE7;--text:#211D29;--muted:#6B6578;--accent:#9F6DE4;--accent-deep:#502A9C;--accent-soft:#F0ECFF;--gold:#F3BC5A;--blush:#B691EA;--shadow:0 12px 48px rgba(33,29,41,.08)}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.7;font-size:16px;-webkit-font-smoothing:antialiased;min-height:100dvh;display:grid;place-items:center;overflow:hidden}

.scene{text-align:center;padding:24px}

.pip-wrap{position:relative;display:inline-block;margin-bottom:24px}
.pip{width:180px;height:180px;filter:drop-shadow(0 12px 32px rgba(124,82,191,.2))}

/* Pip's gentle floating animation */
@keyframes pip-float{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-10px) rotate(2deg)}}
.pip-wrap{animation:pip-float 4s ease-in-out infinite}

/* Floating question marks around Pip */
.qmark{position:absolute;font-size:24px;font-weight:800;color:var(--accent);opacity:.6;animation:qfloat 3s ease-in-out infinite}
.qmark:nth-child(2){top:-8px;right:-12px;animation-delay:0s;font-size:20px}
.qmark:nth-child(3){top:20px;left:-20px;animation-delay:.8s;font-size:28px;color:var(--gold)}
.qmark:nth-child(4){bottom:30px;right:-18px;animation-delay:1.6s;font-size:18px;color:var(--blush)}
@keyframes qfloat{0%,100%{transform:translateY(0) scale(1);opacity:.5}50%{transform:translateY(-12px) scale(1.15);opacity:.9}}

.card{background:var(--surface);border:1px solid var(--border);border-radius:28px;padding:clamp(28px,5vw,44px) clamp(24px,5vw,48px);width:min(90%,420px);margin:0 auto;box-shadow:var(--shadow)}

.code{font-size:clamp(56px,12vw,80px);font-weight:800;background:linear-gradient(135deg,#7B51D0 0%,#9F6DE4 40%,#C4B5FD 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1;margin-bottom:4px;letter-spacing:-3px}

h1{font-size:20px;font-weight:700;margin-bottom:6px}
p{color:var(--muted);font-size:15px;margin-bottom:24px;max-width:300px;margin-inline:auto}

.speech{background:var(--accent-soft);border-radius:16px;padding:14px 20px;margin-bottom:24px;position:relative;font-size:14px;font-weight:500;color:var(--accent-deep);line-height:1.5}
.speech::after{content:'';position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:10px solid var(--accent-soft)}

.btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#7B51D0,#9F6DE4);color:#fff;font-weight:600;font-size:15px;padding:13px 28px;border-radius:16px;text-decoration:none;transition:transform .2s ease,box-shadow .2s ease;border:none;cursor:pointer}
.btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(124,82,191,.35)}
.btn:active{transform:translateY(0)}
.btn svg{width:18px;height:18px}

.links{margin-top:16px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.links a{color:var(--accent);font-size:13px;font-weight:600;text-decoration:none;opacity:.8;transition:opacity .15s}
.links a:hover{opacity:1;text-decoration:underline}

.brand{margin-top:28px;font-size:15px;font-weight:700;letter-spacing:-0.5px;color:var(--text);opacity:.7}
.brand span{color:#6652A3}

/* Decorative scattered coins */
.coin{position:fixed;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#F3BC5A,#E5A93A);opacity:.12;z-index:0}
.coin:nth-child(1){top:10%;left:8%;width:24px;height:24px}
.coin:nth-child(2){top:20%;right:12%;width:18px;height:18px}
.coin:nth-child(3){bottom:15%;left:15%;width:28px;height:28px}
.coin:nth-child(4){bottom:25%;right:8%}
.coin:nth-child(5){top:45%;left:4%;width:14px;height:14px}

@media(prefers-color-scheme:dark){
:root{--bg:#1C1922;--surface:#262230;--border:#40374C;--text:#F6F4FA;--muted:#9B93A8;--accent:#B691EA;--accent-deep:#C4B5FD;--accent-soft:rgba(159,109,228,.15);--shadow:0 12px 48px rgba(0,0,0,.4)}
.coin{opacity:.06}
}
</style>
</head>
<body>

<!-- Decorative coins -->
<div class="coin"></div><div class="coin"></div><div class="coin"></div><div class="coin"></div><div class="coin"></div>

<div class="scene">
  <div class="pip-wrap">
    <span class="qmark">?</span>
    <span class="qmark">?</span>
    <span class="qmark">?</span>
    <!-- Pip mascot SVG in "help" mood (confused) -->
    <svg class="pip" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow -->
      <ellipse cx="109" cy="175" rx="60" ry="10" fill="#D9CEE8" opacity="0.55"/>
      <g transform="rotate(-9,100,100)">
        <!-- Legs -->
        <path d="M55 140 41 160M142 140l14 23" stroke="#502A9C" stroke-width="12" stroke-linecap="round"/>
        <!-- Arms (help/confused pose) -->
        <path d="M50 105 27 105M154 97l19 8" stroke="#7B51D0" stroke-width="12" stroke-linecap="round"/>
        <!-- Body -->
        <rect x="45" y="39" width="113" height="114" rx="36" fill="#9F6DE4"/>
        <!-- Eyebrow -->
        <path d="M58 60q30-24 80-4" fill="none" stroke="#C1A0F0" stroke-width="8" stroke-linecap="round"/>
        <!-- Eyes -->
        <ellipse cx="83" cy="94" rx="7" ry="10" fill="#38255E"/>
        <ellipse cx="125" cy="94" rx="7" ry="10" fill="#38255E"/>
        <!-- Eye shine -->
        <circle cx="85" cy="91" r="2" fill="#FFF"/>
        <circle cx="127" cy="91" r="2" fill="#FFF"/>
        <!-- Mouth (confused/uncertain) -->
        <path d="M92 117q12-5 24 0" stroke="#38255E" stroke-width="4" stroke-linecap="round" fill="none"/>
        <!-- Blush -->
        <ellipse cx="68" cy="111" rx="10" ry="5" fill="#B691EA"/>
        <ellipse cx="139" cy="111" rx="10" ry="5" fill="#B691EA"/>
        <!-- Crown -->
        <g transform="rotate(10,111,31)">
          <rect x="91" y="15" width="40" height="32" rx="11" fill="#F3BC5A"/>
          <path d="m104 26 5 7 10-8" stroke="#9A651E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </g>
      </g>
    </svg>
  </div>

  <div class="card">
    <div class="speech">Hmm, I looked everywhere but couldn't find this page! 🤔</div>
    <div class="code">404</div>
    <h1>Page not found</h1>
    <p>This page doesn't exist, was moved, or maybe the link was wrong.</p>
    <a class="btn" href="/">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9 9 9"/><path d="M9 21V12h6v9"/></svg>
      Go Home
    </a>
    <div class="links">
      <a href="/privacy">Privacy Policy</a>
    </div>
  </div>

  <div class="brand">settle<span>up.</span></div>
</div>

</body>
</html>`;
}
