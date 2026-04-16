import os
import json
import secrets
import hashlib
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, Response, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
import requests
import psycopg2
from psycopg2.extras import RealDictCursor

GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", secrets.token_hex(32))
app.permanent_session_lifetime = timedelta(days=30)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ── DB (Updated for Collaboration) ───────────────────────────────────────────
def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

def init_db():
    if not DATABASE_URL:
        return
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS canvases (
            id SERIAL PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            name TEXT NOT NULL DEFAULT 'Untitled Canvas',
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS canvas_shares (
            id SERIAL PRIMARY KEY,
            canvas_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            permission TEXT NOT NULL DEFAULT 'edit',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(canvas_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            settings JSONB NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)
    conn.commit()
    cursor.close()
    conn.close()

if DATABASE_URL:
    init_db()

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

# ── Auth routes ───────────────────────────────────────────────────────────────

LOGIN_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>SecondBrain — Sign In</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#000000;
  --surface:#0a0a0f;
  --border:#1a1a2e;
  --text:#e8e8f0;
  --muted:#4a4a6a;
  --accent:#7c3aed;
  --accent-glow:rgba(124,58,237,0.4);
  --green:#10b981;
  --red:#ef4444;
}
body{
  background:var(--bg);
  color:var(--text);
  font-family:'JetBrains Mono',monospace;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}
.bg-grid{
  position:fixed;inset:0;pointer-events:none;
  background-image:
    linear-gradient(rgba(124,58,237,0.15) 1px,transparent 1px),
    linear-gradient(90deg,rgba(124,58,237,0.15) 1px,transparent 1px);
  background-size:40px 40px;
}
.glow-orb{
  position:fixed;width:600px;height:600px;border-radius:50%;
  background:radial-gradient(circle,rgba(124,58,237,0.08) 0%,transparent 70%);
  pointer-events:none;
  top:50%;left:50%;transform:translate(-50%,-50%);
}
.card{
  position:relative;z-index:1;
  width:380px;
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:16px;
  padding:40px;
  box-shadow:0 0 60px rgba(124,58,237,0.08),0 0 0 1px rgba(124,58,237,0.1);
}
.logo{
  font-size:11px;letter-spacing:.2em;text-transform:uppercase;
  color:var(--accent);margin-bottom:8px;display:flex;align-items:center;gap:8px;
}
.logo-dot{
  width:6px;height:6px;border-radius:50%;background:var(--accent);
  box-shadow:0 0 8px var(--accent-glow);
  animation:pulse 2s ease-in-out infinite;
}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 8px var(--accent-glow);}50%{opacity:.6;box-shadow:0 0 16px var(--accent-glow);}}
h1{font-size:22px;font-weight:700;margin-bottom:6px;color:#fff;}
.subtitle{font-size:11px;color:var(--muted);margin-bottom:32px;}
.tabs{display:flex;gap:4px;margin-bottom:28px;background:#050508;border-radius:8px;padding:3px;}
.tab{flex:1;padding:7px;font-family:inherit;font-size:11px;border:none;border-radius:6px;cursor:pointer;transition:all .2s;color:var(--muted);background:transparent;}
.tab.active{background:var(--surface);color:var(--text);border:1px solid var(--border);box-shadow:0 0 12px rgba(124,58,237,0.15);}
.field{margin-bottom:16px;}
label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px;}
input{
  width:100%;padding:10px 12px;
  background:#050508;border:1px solid var(--border);
  border-radius:8px;color:var(--text);font-family:inherit;font-size:12px;
  outline:none;transition:border-color .2s,box-shadow .2s;
}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,58,237,0.12);}
.remember{display:flex;align-items:center;gap:8px;margin-bottom:20px;cursor:pointer;}
.remember input[type=checkbox]{width:14px;height:14px;accent-color:var(--accent);}
.remember span{font-size:11px;color:var(--muted);}
.btn{
  width:100%;padding:11px;
  background:var(--accent);border:none;border-radius:8px;
  color:#fff;font-family:inherit;font-size:12px;font-weight:600;
  cursor:pointer;transition:all .2s;letter-spacing:.04em;
  box-shadow:0 0 20px rgba(124,58,237,0.3);
}
.btn:hover{background:#6d28d9;box-shadow:0 0 30px rgba(124,58,237,0.5);}
.msg{font-size:11px;margin-top:14px;padding:8px 12px;border-radius:6px;display:none;}
.msg.error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:var(--red);}
.msg.success{background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);color:var(--green);}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="glow-orb"></div>
<div class="card">
  <div class="logo"><div class="logo-dot"></div>SecondBrain</div>
  <h1>Welcome back</h1>
  <div class="subtitle">Your knowledge graph awaits.</div>
  <div class="tabs">
    <button class="tab active" id="tab-signin" onclick="switchTab('signin')">Sign In</button>
    <button class="tab" id="tab-signup" onclick="switchTab('signup')">Sign Up</button>
  </div>
  <div class="field"><label>Email</label><input type="email" id="email" placeholder="you@example.com" autocomplete="email"/></div>
  <div class="field"><label>Password</label><input type="password" id="password" placeholder="••••••••" autocomplete="current-password"/></div>
  <label class="remember">
    <input type="checkbox" id="remember" checked/>
    <span>Keep me signed in for 30 days</span>
  </label>
  <button class="btn" onclick="submit()">Sign In →</button>
  <div class="msg" id="msg"></div>
</div>
<script>
let mode='signin';
function switchTab(t){
  mode=t;
  document.getElementById('tab-signin').classList.toggle('active',t==='signin');
  document.getElementById('tab-signup').classList.toggle('active',t==='signup');
  document.querySelector('.btn').textContent=t==='signin'?'Sign In →':'Create Account →';
  document.getElementById('msg').style.display='none';
}
async function submit(){
  const email=document.getElementById('email').value.trim();
  const password=document.getElementById('password').value;
  const remember=document.getElementById('remember').checked;
  const msg=document.getElementById('msg');
  msg.style.display='none';
  if(!email||!password){msg.className='msg error';msg.textContent='Please fill in all fields.';msg.style.display='block';return;}
  const endpoint=mode==='signin'?'/auth/login':'/auth/signup';
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,remember})});
  const d=await r.json();
  if(d.ok){msg.className='msg success';msg.textContent='Success! Redirecting…';msg.style.display='block';setTimeout(()=>window.location.href='/',500);}
  else{msg.className='msg error';msg.textContent=d.error||'Something went wrong.';msg.style.display='block';}
}
document.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
</script>
</body>
</html>"""

@app.route("/login")
def login_page():
    if "user_id" in session: return redirect("/")
    return Response(LOGIN_HTML, mimetype="text/html")

@app.route("/auth/signup", methods=["POST"])
def signup():
    d = request.get_json()
    email = d.get("email", "").strip().lower()
    password = d.get("password", "")
    remember = d.get("remember", True)
    if not email or not password: return jsonify({"ok": False, "error": "Missing credentials"}), 400
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email=%s", (email,))
        if cursor.fetchone(): return jsonify({"ok": False, "error": "Email already exists"}), 400
        cursor.execute("INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
                       (email, hash_password(password)))
        uid = cursor.fetchone()["id"]
        conn.commit()
        session.permanent = remember
        session["user_id"] = uid
        session["user_email"] = email
        # Create default canvas
        cursor.execute("INSERT INTO canvases (owner_id, name, data) VALUES (%s, %s, %s)",
                      (uid, "My First Canvas", "{}"))
        conn.commit()
        return jsonify({"ok": True})
    except Exception as e:
        conn.rollback()
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route("/auth/login", methods=["POST"])
def login():
    d = request.get_json()
    email = d.get("email", "").strip().lower()
    password = d.get("password", "")
    remember = d.get("remember", True)
    if not email or not password: return jsonify({"ok": False, "error": "Missing credentials"}), 400
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, password_hash FROM users WHERE email=%s", (email,))
        row = cursor.fetchone()
        if not row or row["password_hash"] != hash_password(password):
            return jsonify({"ok": False, "error": "Invalid credentials"}), 401
        session.permanent = remember
        session["user_id"] = row["id"]
        session["user_email"] = email
        return jsonify({"ok": True})
    finally:
        cursor.close()
        conn.close()

@app.route("/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})

# Main app HTML with collaboration features
INDEX_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no"/>
<title>SecondBrain</title>
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
:root{
  --bg:#000000;--surface:#0a0a0f;--border:#1a1a2e;--text:#e8e8f0;--muted:#4a4a6a;
  --accent:#7c3aed;--accent-hover:#6d28d9;--accent-glow:rgba(124,58,237,0.4);
  --green:#10b981;--red:#ef4444;--blue:#3b82f6;--orange:#f97316;--yellow:#eab308;
}
body{
  background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace;
  min-height:100vh;overflow:hidden;position:relative;
}
.bg-grid{
  position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:linear-gradient(rgba(124,58,237,0.05) 1px,transparent 1px),
    linear-gradient(90deg,rgba(124,58,237,0.05) 1px,transparent 1px);
  background-size:40px 40px;
}

/* Canvas Tabs */
.canvas-tabs{
  position:fixed;top:0;left:0;right:0;height:42px;
  background:var(--surface);border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:4px;padding:0 12px;z-index:1000;
  overflow-x:auto;overflow-y:hidden;
}
.canvas-tabs::-webkit-scrollbar{height:4px;}
.canvas-tabs::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
.canvas-tab{
  padding:6px 14px;border-radius:6px;font-size:11px;white-space:nowrap;
  background:transparent;border:1px solid transparent;color:var(--muted);
  cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:6px;
}
.canvas-tab:hover{background:#050508;border-color:var(--border);}
.canvas-tab.active{background:var(--bg);border-color:var(--accent);color:var(--text);}
.canvas-tab .close{opacity:0;margin-left:4px;color:var(--red);font-weight:700;cursor:pointer;}
.canvas-tab:hover .close,.canvas-tab.active .close{opacity:1;}
.canvas-tab .close:hover{color:#fff;}
.new-canvas-btn{
  padding:6px 12px;border-radius:6px;font-size:11px;background:var(--accent);
  color:#fff;border:none;cursor:pointer;margin-left:auto;flex-shrink:0;
}
.new-canvas-btn:hover{background:var(--accent-hover);}

/* Top Bar */
.topbar{
  position:fixed;top:42px;left:0;right:0;height:56px;
  background:var(--surface);border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;padding:0 20px;z-index:999;
}
.logo{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:6px;}
.logo-dot{width:5px;height:5px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent-glow);animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.6;}}

.topbar-actions{display:flex;align-items:center;gap:10px;}
.btn-icon{
  width:34px;height:34px;border-radius:7px;background:var(--bg);border:1px solid var(--border);
  color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;
  font-size:14px;transition:all .2s;position:relative;
}
.btn-icon:hover{background:#050508;border-color:var(--accent);}
.btn-icon.active{background:var(--accent);border-color:var(--accent);color:#fff;}

/* Share Dropdown */
.share-dropdown{
  position:absolute;top:calc(100% + 8px);right:0;width:320px;
  background:var(--surface);border:1px solid var(--border);border-radius:10px;
  box-shadow:0 8px 32px rgba(0,0,0,0.5);padding:16px;display:none;z-index:2000;
}
.share-dropdown.show{display:block;}
.share-header{font-size:13px;font-weight:600;margin-bottom:12px;color:#fff;}
.share-input-row{display:flex;gap:8px;margin-bottom:12px;}
.share-input{
  flex:1;padding:8px 10px;background:#050508;border:1px solid var(--border);
  border-radius:6px;color:var(--text);font-size:11px;font-family:inherit;outline:none;
}
.share-input:focus{border-color:var(--accent);}
.share-btn{
  padding:8px 14px;border-radius:6px;font-size:11px;font-family:inherit;
  cursor:pointer;border:none;transition:all .2s;font-weight:600;
}
.share-btn.add{background:var(--green);color:#fff;}
.share-btn.add:hover{background:#059669;}
.share-btn.call{background:var(--blue);color:#fff;}
.share-btn.call:hover{background:#2563eb;}
.share-list{max-height:180px;overflow-y:auto;margin-top:12px;}
.share-item{
  display:flex;align-items:center;justify-content:space-between;padding:8px 10px;
  border-radius:6px;margin-bottom:6px;background:#050508;font-size:11px;
}
.share-item .email{color:var(--text);}
.share-item .remove{
  color:var(--red);cursor:pointer;font-size:13px;opacity:0.7;
  transition:opacity .2s;
}
.share-item .remove:hover{opacity:1;}
.user-suggestions{
  position:absolute;background:var(--surface);border:1px solid var(--border);
  border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-height:120px;
  overflow-y:auto;display:none;z-index:2001;width:100%;top:100%;margin-top:4px;
}
.user-suggestion{
  padding:8px 10px;font-size:11px;cursor:pointer;transition:background .1s;
  border-bottom:1px solid var(--border);
}
.user-suggestion:last-child{border-bottom:none;}
.user-suggestion:hover{background:#050508;}

/* Shared Canvases Dropdown */
.shared-dropdown{
  position:absolute;top:calc(100% + 8px);right:0;width:280px;
  background:var(--surface);border:1px solid var(--border);border-radius:10px;
  box-shadow:0 8px 32px rgba(0,0,0,0.5);padding:16px;display:none;z-index:2000;
  max-height:400px;overflow-y:auto;
}
.shared-dropdown.show{display:block;}
.shared-canvas-item{
  padding:10px;background:#050508;border-radius:6px;margin-bottom:8px;
  cursor:pointer;transition:all .2s;border:1px solid transparent;
}
.shared-canvas-item:hover{border-color:var(--accent);background:var(--bg);}
.shared-canvas-item .name{font-size:12px;color:var(--text);font-weight:500;}
.shared-canvas-item .owner{font-size:10px;color:var(--muted);margin-top:4px;}

/* Call Notification */
.call-notification{
  position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
  width:360px;background:var(--surface);border:2px solid var(--accent);
  border-radius:16px;box-shadow:0 16px 64px rgba(124,58,237,0.3);
  padding:28px;text-align:center;display:none;z-index:3000;
  animation:callPulse 1.5s infinite;
}
@keyframes callPulse{0%,100%{box-shadow:0 16px 64px rgba(124,58,237,0.3);}50%{box-shadow:0 16px 80px rgba(124,58,237,0.6);}}
.call-notification.show{display:block;}
.call-caller{font-size:16px;font-weight:600;margin-bottom:8px;color:#fff;}
.call-subtitle{font-size:11px;color:var(--muted);margin-bottom:20px;}
.call-actions{display:flex;gap:12px;justify-content:center;}
.call-btn{
  padding:10px 24px;border-radius:8px;font-family:inherit;font-size:12px;
  font-weight:600;cursor:pointer;border:none;transition:all .2s;
}
.call-btn.accept{background:var(--green);color:#fff;}
.call-btn.accept:hover{background:#059669;}
.call-btn.decline{background:var(--red);color:#fff;}
.call-btn.decline:hover{background:#dc2626;}

/* Cursors */
.remote-cursor{
  position:absolute;pointer-events:none;z-index:9999;
  transition:transform .08s linear;
}
.remote-cursor svg{width:20px;height:20px;}
.remote-cursor .cursor-label{
  position:absolute;top:20px;left:0;background:var(--accent);
  color:#fff;padding:3px 8px;border-radius:4px;font-size:9px;
  white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);
}

/* Main canvas area */
#main{position:absolute;top:98px;left:0;right:0;bottom:0;overflow:hidden;}
#canvas{position:absolute;top:0;left:0;cursor:grab;}
#canvas.dragging{cursor:grabbing;}

/* Rest of your existing styles... (nodes, groups, input, etc) */
.node{
  position:absolute;min-width:120px;max-width:280px;
  background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:12px 14px;cursor:move;box-shadow:0 2px 12px rgba(0,0,0,0.2);
  transition:box-shadow .2s,border-color .2s;
}
.node:hover{box-shadow:0 4px 20px rgba(124,58,237,0.15);border-color:var(--accent);}
.node.selected{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,58,237,0.2);}
.node-text{
  font-size:12px;line-height:1.5;color:var(--text);word-wrap:break-word;
  outline:none;white-space:pre-wrap;
}
.node-text[contenteditable]:empty:before{content:attr(data-placeholder);color:var(--muted);}

.group{
  position:absolute;background:rgba(124,58,237,0.03);
  border:1px dashed rgba(124,58,237,0.3);border-radius:12px;
  cursor:move;
}
.group-header{
  padding:8px 12px;border-bottom:1px solid rgba(124,58,237,0.2);
  display:flex;align-items:center;justify-content:space-between;
}
.group-title{
  font-size:11px;font-weight:600;color:var(--accent);
  outline:none;flex:1;
}
.group-toggle{
  width:20px;height:20px;border-radius:4px;background:var(--surface);
  border:1px solid var(--border);cursor:pointer;display:flex;
  align-items:center;justify-content:center;font-size:10px;color:var(--muted);
}
.group-toggle:hover{background:#050508;color:var(--text);}
.group.collapsed{background:rgba(124,58,237,0.05);}
.group.collapsed .group-toggle::before{content:'+';}
.group:not(.collapsed) .group-toggle::before{content:'−';}

.edge{
  position:absolute;pointer-events:none;
}
.edge line{stroke:rgba(124,58,237,0.3);stroke-width:1.5;transition:stroke .2s;}
.edge.selected line{stroke:var(--accent);stroke-width:2;}

.input-panel{
  position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
  width:90%;max-width:600px;background:var(--surface);
  border:1px solid var(--border);border-radius:12px;
  box-shadow:0 8px 32px rgba(0,0,0,0.4);padding:16px;z-index:900;
}
.input-row{display:flex;gap:10px;align-items:flex-start;}
#userInput{
  flex:1;padding:10px 12px;background:#050508;border:1px solid var(--border);
  border-radius:8px;color:var(--text);font-family:inherit;font-size:12px;
  resize:none;outline:none;min-height:42px;max-height:120px;
}
#userInput:focus{border-color:var(--accent);}
#sendBtn{
  padding:10px 20px;background:var(--accent);border:none;border-radius:8px;
  color:#fff;font-family:inherit;font-size:12px;font-weight:600;
  cursor:pointer;transition:all .2s;
}
#sendBtn:hover{background:var(--accent-hover);}
#sendBtn:disabled{opacity:0.5;cursor:not-allowed;}

.ai-suggestions{
  display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;
}
.suggestion-chip{
  padding:6px 12px;background:#050508;border:1px solid var(--border);
  border-radius:6px;font-size:10px;color:var(--text);cursor:pointer;
  transition:all .2s;
}
.suggestion-chip:hover{border-color:var(--accent);background:var(--bg);}

.context-menu{
  position:fixed;background:var(--surface);border:1px solid var(--border);
  border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);
  padding:6px;min-width:160px;z-index:10000;display:none;
}
.context-menu.show{display:block;}
.context-item{
  padding:8px 12px;font-size:11px;cursor:pointer;border-radius:4px;
  transition:background .1s;display:flex;align-items:center;gap:8px;
}
.context-item:hover{background:#050508;}
.context-item .icon{width:14px;text-align:center;}

.timer-display{
  position:fixed;top:120px;right:24px;padding:16px 20px;
  background:var(--surface);border:1px solid var(--border);
  border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.3);
  display:none;z-index:800;
}
.timer-display.show{display:block;}
.timer-time{font-size:24px;font-weight:700;color:var(--accent);text-align:center;}
.timer-label{font-size:10px;color:var(--muted);text-align:center;margin-top:4px;}

@media(max-width:768px){
  .topbar{padding:0 12px;}
  .input-panel{width:calc(100% - 24px);max-width:none;}
  .share-dropdown,.shared-dropdown{width:calc(100vw - 32px);left:16px;right:16px;}
}
</style>
</head>
<body>
<div class="bg-grid"></div>

<!-- Canvas Tabs -->
<div class="canvas-tabs" id="canvasTabs">
  <button class="new-canvas-btn" onclick="createNewCanvas()">+ New Canvas</button>
</div>

<!-- Top Bar -->
<div class="topbar">
  <div class="logo"><div class="logo-dot"></div>SecondBrain</div>
  <div class="topbar-actions">
    <div style="position:relative;">
      <button class="btn-icon" onclick="toggleSharedDropdown()" title="Shared with me">
        <span>📂</span>
      </button>
      <div class="shared-dropdown" id="sharedDropdown"></div>
    </div>
    <div style="position:relative;">
      <button class="btn-icon" onclick="toggleShareDropdown()" title="Share canvas">
        <span>🔗</span>
      </button>
      <div class="share-dropdown" id="shareDropdown">
        <div class="share-header">Share this canvas</div>
        <div style="position:relative;">
          <div class="share-input-row">
            <input type="email" class="share-input" id="shareEmail" placeholder="Enter email..." autocomplete="off"/>
          </div>
          <div class="user-suggestions" id="userSuggestions"></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <button class="share-btn add" onclick="shareCanvas('add')">Add Collaborator</button>
          <button class="share-btn call" onclick="shareCanvas('call')">Call</button>
        </div>
        <div class="share-list" id="shareList"></div>
      </div>
    </div>
    <button class="btn-icon" onclick="smartRecenter()" title="Recenter">⊙</button>
    <button class="btn-icon" onclick="logout()" title="Sign out">⏻</button>
  </div>
</div>

<!-- Call Notification -->
<div class="call-notification" id="callNotification">
  <div class="call-caller" id="callerEmail"></div>
  <div class="call-subtitle">wants to collaborate on this canvas</div>
  <div class="call-actions">
    <button class="call-btn accept" onclick="acceptCall()">Accept</button>
    <button class="call-btn decline" onclick="declineCall()">Decline</button>
  </div>
</div>

<!-- Main Canvas -->
<div id="main">
  <svg id="edgeLayer" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;"></svg>
  <div id="canvas"></div>
</div>

<!-- Remote Cursors Container -->
<div id="remoteCursors"></div>

<!-- Input Panel -->
<div class="input-panel">
  <div class="input-row">
    <textarea id="userInput" placeholder="Ask a question, create nodes, or collaborate..."></textarea>
    <button id="sendBtn" onclick="sendMessage()">Send</button>
  </div>
  <div class="ai-suggestions" id="suggestions"></div>
</div>

<!-- Context Menu -->
<div class="context-menu" id="contextMenu"></div>

<!-- Timer -->
<div class="timer-display" id="timerDisplay">
  <div class="timer-time" id="timerTime">00:00</div>
  <div class="timer-label">Time Remaining</div>
</div>

<script>
// ═══════════════════════════════════════════════════════════════════════════
// GLOBALS & STATE
// ═══════════════════════════════════════════════════════════════════════════
let socket = io();
let nodes = [], edges = [], groups = [];
let selectedNodes = new Set();
let selectedEdges = new Set();
let selectedGroups = new Set();
let isPanning = false, panStartX = 0, panStartY = 0;
let offsetX = 0, offsetY = 0, scale = 1;
let draggedNode = null, draggedGroup = null;
let dragOffsetX = 0, dragOffsetY = 0;
let nextNodeId = 1, nextEdgeId = 1, nextGroupId = 1;
let userEmail = '';
let currentCanvasId = null;
let canvases = [];
let remoteCursors = {};
let currentCall = null;

// ═══════════════════════════════════════════════════════════════════════════
// SOCKET.IO - REAL-TIME COLLABORATION
// ═══════════════════════════════════════════════════════════════════════════
socket.on('connect', () => {
  console.log('Connected to collaboration server');
  if (currentCanvasId) {
    socket.emit('join_canvas', { canvas_id: currentCanvasId });
  }
});

socket.on('canvas_update', (data) => {
  if (data.from_user !== userEmail) {
    nodes = data.nodes || [];
    edges = data.edges || [];
    groups = data.groups || [];
    render();
  }
});

socket.on('cursor_move', (data) => {
  if (data.user !== userEmail) {
    updateRemoteCursor(data.user, data.x, data.y);
  }
});

socket.on('incoming_call', (data) => {
  showCallNotification(data.from_email, data.canvas_id);
});

socket.on('call_accepted', (data) => {
  alert(`${data.user} joined your collaborative session!`);
  currentCall = data.canvas_id;
});

socket.on('call_declined', (data) => {
  alert(`${data.user} declined your call.`);
});

function joinCanvasRoom(canvasId) {
  socket.emit('join_canvas', { canvas_id: canvasId });
}

function broadcastUpdate() {
  if (!currentCanvasId) return;
  socket.emit('canvas_update', {
    canvas_id: currentCanvasId,
    nodes: nodes,
    edges: edges,
    groups: groups
  });
}

function broadcastCursor(x, y) {
  if (!currentCanvasId) return;
  socket.emit('cursor_move', {
    canvas_id: currentCanvasId,
    x: x,
    y: y
  });
}

function updateRemoteCursor(user, x, y) {
  let cursor = remoteCursors[user];
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3L19 12L12 13L9 21L5 3Z" fill="#7c3aed" stroke="#fff" stroke-width="1.5"/>
      </svg>
      <div class="cursor-label">${user.split('@')[0]}</div>
    `;
    document.getElementById('remoteCursors').appendChild(cursor);
    remoteCursors[user] = cursor;
  }
  cursor.style.transform = `translate(${x}px, ${y}px)`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
async function loadCanvases() {
  const res = await fetch('/canvases');
  const data = await res.json();
  canvases = data.canvases || [];
  userEmail = data.user_email || '';
  renderCanvasTabs();
  if (canvases.length > 0 && !currentCanvasId) {
    switchCanvas(canvases[0].id);
  }
}

function renderCanvasTabs() {
  const container = document.getElementById('canvasTabs');
  const newBtn = container.querySelector('.new-canvas-btn');
  container.innerHTML = '';
  canvases.forEach(c => {
    const tab = document.createElement('div');
    tab.className = 'canvas-tab' + (c.id === currentCanvasId ? ' active' : '');
    tab.innerHTML = `
      <span>${c.name}</span>
      <span class="close" onclick="event.stopPropagation();deleteCanvas(${c.id})">×</span>
    `;
    tab.onclick = () => switchCanvas(c.id);
    container.appendChild(tab);
  });
  container.appendChild(newBtn);
}

async function switchCanvas(canvasId) {
  if (currentCanvasId === canvasId) return;
  
  // Leave old room
  if (currentCanvasId) {
    socket.emit('leave_canvas', { canvas_id: currentCanvasId });
  }
  
  currentCanvasId = canvasId;
  joinCanvasRoom(canvasId);
  
  const res = await fetch(`/canvas/${canvasId}`);
  const data = await res.json();
  
  nodes = data.nodes || [];
  edges = data.edges || [];
  groups = data.groups || [];
  
  // Update IDs
  nextNodeId = Math.max(0, ...nodes.map(n => n.id)) + 1;
  nextEdgeId = Math.max(0, ...edges.map(e => e.id)) + 1;
  nextGroupId = Math.max(0, ...groups.map(g => g.id)) + 1;
  
  renderCanvasTabs();
  render();
  loadShares();
}

async function createNewCanvas() {
  const name = prompt('Canvas name:', 'Untitled Canvas') || 'Untitled Canvas';
  const res = await fetch('/canvas/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (data.ok) {
    await loadCanvases();
    switchCanvas(data.canvas_id);
  }
}

async function deleteCanvas(canvasId) {
  if (!confirm('Delete this canvas?')) return;
  await fetch(`/canvas/${canvasId}`, { method: 'DELETE' });
  await loadCanvases();
  if (currentCanvasId === canvasId && canvases.length > 0) {
    switchCanvas(canvases[0].id);
  }
}

async function saveGraph() {
  if (!currentCanvasId) return;
  await fetch(`/canvas/${currentCanvasId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges, groups })
  });
  broadcastUpdate();
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARING & COLLABORATION
// ═══════════════════════════════════════════════════════════════════════════
function toggleShareDropdown() {
  const dropdown = document.getElementById('shareDropdown');
  dropdown.classList.toggle('show');
  if (dropdown.classList.contains('show')) {
    loadShares();
    document.getElementById('sharedDropdown').classList.remove('show');
  }
}

function toggleSharedDropdown() {
  const dropdown = document.getElementById('sharedDropdown');
  dropdown.classList.toggle('show');
  if (dropdown.classList.contains('show')) {
    loadSharedCanvases();
    document.getElementById('shareDropdown').classList.remove('show');
  }
}

async function loadShares() {
  if (!currentCanvasId) return;
  const res = await fetch(`/canvas/${currentCanvasId}/shares`);
  const data = await res.json();
  const list = document.getElementById('shareList');
  list.innerHTML = '';
  (data.shares || []).forEach(share => {
    const item = document.createElement('div');
    item.className = 'share-item';
    item.innerHTML = `
      <span class="email">${share.email}</span>
      <span class="remove" onclick="removeShare('${share.email}')">×</span>
    `;
    list.appendChild(item);
  });
}

async function loadSharedCanvases() {
  const res = await fetch('/canvases/shared');
  const data = await res.json();
  const dropdown = document.getElementById('sharedDropdown');
  dropdown.innerHTML = '<div class="share-header">Shared with me</div>';
  (data.canvases || []).forEach(c => {
    const item = document.createElement('div');
    item.className = 'shared-canvas-item';
    item.innerHTML = `
      <div class="name">${c.name}</div>
      <div class="owner">by ${c.owner_email}</div>
    `;
    item.onclick = () => {
      switchCanvas(c.id);
      dropdown.classList.remove('show');
    };
    dropdown.appendChild(item);
  });
}

let shareInputTimeout;
document.addEventListener('DOMContentLoaded', () => {
  const shareInput = document.getElementById('shareEmail');
  shareInput.addEventListener('input', (e) => {
    clearTimeout(shareInputTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
      document.getElementById('userSuggestions').style.display = 'none';
      return;
    }
    shareInputTimeout = setTimeout(() => searchUsers(query), 300);
  });
});

async function searchUsers(query) {
  const res = await fetch(`/users/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  const suggestions = document.getElementById('userSuggestions');
  suggestions.innerHTML = '';
  (data.users || []).forEach(user => {
    const item = document.createElement('div');
    item.className = 'user-suggestion';
    item.textContent = user.email;
    item.onclick = () => {
      document.getElementById('shareEmail').value = user.email;
      suggestions.style.display = 'none';
    };
    suggestions.appendChild(item);
  });
  suggestions.style.display = (data.users || []).length > 0 ? 'block' : 'none';
}

async function shareCanvas(type) {
  const email = document.getElementById('shareEmail').value.trim();
  if (!email || !currentCanvasId) return;
  
  if (type === 'call') {
    await fetch('/canvas/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canvas_id: currentCanvasId, target_email: email })
    });
    alert(`Call sent to ${email}!`);
  } else {
    await fetch(`/canvas/${currentCanvasId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, permission: 'edit' })
    });
    loadShares();
  }
  
  document.getElementById('shareEmail').value = '';
  document.getElementById('userSuggestions').style.display = 'none';
}

async function removeShare(email) {
  if (!currentCanvasId) return;
  await fetch(`/canvas/${currentCanvasId}/share`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  loadShares();
}

function showCallNotification(callerEmail, canvasId) {
  currentCall = { from: callerEmail, canvas_id: canvasId };
  document.getElementById('callerEmail').textContent = callerEmail;
  document.getElementById('callNotification').classList.add('show');
}

function acceptCall() {
  if (!currentCall) return;
  socket.emit('accept_call', { canvas_id: currentCall.canvas_id, from: currentCall.from });
  switchCanvas(currentCall.canvas_id);
  document.getElementById('callNotification').classList.remove('show');
  currentCall = null;
}

function declineCall() {
  if (!currentCall) return;
  socket.emit('decline_call', { canvas_id: currentCall.canvas_id, from: currentCall.from });
  document.getElementById('callNotification').classList.remove('show');
  currentCall = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// YOUR EXISTING NODE/EDGE/GROUP LOGIC (keeping everything else intact)
// ═══════════════════════════════════════════════════════════════════════════
function render() {
  const c = document.getElementById('canvas');
  c.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  
  // Clear and render
  c.innerHTML = '';
  document.getElementById('edgeLayer').innerHTML = '';
  
  groups.forEach(g => {
    if (!g.collapsed) {
      const div = document.createElement('div');
      div.className = 'group' + (selectedGroups.has(g.id) ? ' selected' : '');
      div.style.left = g.x + 'px';
      div.style.top = g.y + 'px';
      div.style.width = g.width + 'px';
      div.style.height = g.height + 'px';
      div.innerHTML = `
        <div class="group-header">
          <div class="group-title" contenteditable="true" onblur="updateGroupTitle(${g.id}, this.textContent)">${g.title}</div>
          <div class="group-toggle" onclick="toggleGroup(${g.id})"></div>
        </div>
      `;
      div.onmousedown = (e) => startGroupDrag(e, g);
      c.appendChild(div);
    } else {
      const div = document.createElement('div');
      div.className = 'group collapsed' + (selectedGroups.has(g.id) ? ' selected' : '');
      div.style.left = g.x + 'px';
      div.style.top = g.y + 'px';
      div.style.width = '200px';
      div.innerHTML = `
        <div class="group-header">
          <div class="group-title">${g.title}</div>
          <div class="group-toggle" onclick="toggleGroup(${g.id})"></div>
        </div>
      `;
      div.onmousedown = (e) => startGroupDrag(e, g);
      c.appendChild(div);
    }
  });
  
  nodes.forEach(n => {
    const inCollapsedGroup = groups.some(g => g.collapsed && g.nodeIds.includes(n.id));
    if (inCollapsedGroup) return;
    
    const div = document.createElement('div');
    div.className = 'node' + (selectedNodes.has(n.id) ? ' selected' : '');
    div.style.left = n.x + 'px';
    div.style.top = n.y + 'px';
    div.innerHTML = `<div class="node-text" contenteditable="true" data-placeholder="Type here..." onblur="updateNode(${n.id}, this.textContent)">${n.text}</div>`;
    div.onmousedown = (e) => startNodeDrag(e, n);
    div.oncontextmenu = (e) => { e.preventDefault(); showContextMenu(e, 'node', n.id); };
    c.appendChild(div);
  });
  
  renderEdges();
}

function renderEdges() {
  const svg = document.getElementById('edgeLayer');
  edges.forEach(e => {
    const from = nodes.find(n => n.id === e.from);
    const to = nodes.find(n => n.id === e.to);
    if (!from || !to) return;
    
    const fromInCollapsed = groups.some(g => g.collapsed && g.nodeIds.includes(from.id));
    const toInCollapsed = groups.some(g => g.collapsed && g.nodeIds.includes(to.id));
    if (fromInCollapsed || toInCollapsed) return;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x + 70);
    line.setAttribute('y1', from.y + 20);
    line.setAttribute('x2', to.x + 70);
    line.setAttribute('y2', to.y + 20);
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('edge');
    if (selectedEdges.has(e.id)) g.classList.add('selected');
    g.appendChild(line);
    g.onclick = () => toggleEdgeSelection(e.id);
    svg.appendChild(g);
  });
}

function createNode(text, x, y) {
  const node = { id: nextNodeId++, text, x, y };
  nodes.push(node);
  render();
  saveGraph();
}

function updateNode(id, text) {
  const n = nodes.find(n => n.id === id);
  if (n) {
    n.text = text;
    saveGraph();
  }
}

function deleteNode(id) {
  nodes = nodes.filter(n => n.id !== id);
  edges = edges.filter(e => e.from !== id && e.to !== id);
  groups.forEach(g => g.nodeIds = g.nodeIds.filter(nid => nid !== id));
  selectedNodes.delete(id);
  render();
  saveGraph();
}

function createEdge(from, to) {
  if (edges.some(e => e.from === from && e.to === to)) return;
  edges.push({ id: nextEdgeId++, from, to });
  render();
  saveGraph();
}

function deleteEdge(id) {
  edges = edges.filter(e => e.id !== id);
  selectedEdges.delete(id);
  render();
  saveGraph();
}

function createGroup(title, nodeIds, x, y, width, height) {
  groups.push({ id: nextGroupId++, title, nodeIds, x, y, width, height, collapsed: false });
  render();
  saveGraph();
}

function toggleGroup(id) {
  const g = groups.find(g => g.id === id);
  if (g) {
    g.collapsed = !g.collapsed;
    render();
    saveGraph();
  }
}

function updateGroupTitle(id, title) {
  const g = groups.find(g => g.id === id);
  if (g) {
    g.title = title;
    saveGraph();
  }
}

function deleteGroup(id) {
  groups = groups.filter(g => g.id !== id);
  selectedGroups.delete(id);
  render();
  saveGraph();
}

function toggleNodeSelection(id) {
  if (selectedNodes.has(id)) selectedNodes.delete(id);
  else selectedNodes.add(id);
  render();
}

function toggleEdgeSelection(id) {
  if (selectedEdges.has(id)) selectedEdges.delete(id);
  else selectedEdges.add(id);
  render();
}

function startNodeDrag(e, node) {
  if (e.button !== 0 || e.target.contentEditable === 'true') return;
  e.preventDefault();
  draggedNode = node;
  dragOffsetX = e.clientX / scale - node.x;
  dragOffsetY = e.clientY / scale - node.y;
}

function startGroupDrag(e, group) {
  if (e.button !== 0 || e.target.contentEditable === 'true') return;
  e.preventDefault();
  draggedGroup = group;
  dragOffsetX = e.clientX / scale - group.x;
  dragOffsetY = e.clientY / scale - group.y;
}

function smartRecenter(animate = true) {
  if (nodes.length === 0) return;
  const padding = 100;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + 140);
    maxY = Math.max(maxY, n.y + 40);
  });
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight - 98;
  const scaleX = (viewWidth - 2 * padding) / contentWidth;
  const scaleY = (viewHeight - 2 * padding) / contentHeight;
  scale = Math.min(1, scaleX, scaleY, 1.5);
  offsetX = (viewWidth - (minX + maxX) * scale) / 2;
  offsetY = (viewHeight - (minY + maxY) * scale) / 2 + 98;
  render();
}

// Mouse events
document.addEventListener('mousemove', (e) => {
  if (draggedNode) {
    draggedNode.x = e.clientX / scale - dragOffsetX;
    draggedNode.y = (e.clientY - 98) / scale - dragOffsetY;
    render();
  } else if (draggedGroup) {
    const dx = e.clientX / scale - dragOffsetX - draggedGroup.x;
    const dy = (e.clientY - 98) / scale - dragOffsetY - draggedGroup.y;
    draggedGroup.x += dx;
    draggedGroup.y += dy;
    draggedGroup.nodeIds.forEach(nid => {
      const n = nodes.find(n => n.id === nid);
      if (n) { n.x += dx; n.y += dy; }
    });
    render();
  } else if (isPanning) {
    offsetX = e.clientX - panStartX;
    offsetY = e.clientY - panStartY;
    render();
  }
  
  // Broadcast cursor
  broadcastCursor(e.clientX, e.clientY);
});

document.addEventListener('mouseup', () => {
  if (draggedNode || draggedGroup) saveGraph();
  draggedNode = null;
  draggedGroup = null;
  isPanning = false;
});

document.getElementById('main').addEventListener('mousedown', (e) => {
  if (e.target.id === 'main' || e.target.id === 'canvas') {
    isPanning = true;
    panStartX = e.clientX - offsetX;
    panStartY = e.clientY - offsetY;
  }
});

document.getElementById('main').addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale = Math.max(0.3, Math.min(2, scale * delta));
  render();
});

// Context menu
function showContextMenu(e, type, id) {
  const menu = document.getElementById('contextMenu');
  menu.innerHTML = '';
  
  if (type === 'node') {
    menu.innerHTML = `
      <div class="context-item" onclick="deleteNode(${id});hideContextMenu()"><span class="icon">🗑</span>Delete Node</div>
      <div class="context-item" onclick="startConnecting(${id});hideContextMenu()"><span class="icon">🔗</span>Connect to...</div>
    `;
  }
  
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('show');
}

function hideContextMenu() {
  document.getElementById('contextMenu').classList.remove('show');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.context-menu')) hideContextMenu();
  if (!e.target.closest('.share-dropdown')) document.getElementById('shareDropdown').classList.remove('show');
  if (!e.target.closest('.shared-dropdown') && !e.target.closest('[onclick*="toggleSharedDropdown"]')) {
    document.getElementById('sharedDropdown').classList.remove('show');
  }
});

// Input & AI
async function sendMessage() {
  const input = document.getElementById('userInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  
  // Simple handling - you can expand this
  if (msg.toLowerCase().startsWith('create ')) {
    const text = msg.slice(7);
    createNode(text, Math.random() * 400 + 200, Math.random() * 300 + 150);
  } else {
    // AI chat or other logic
    alert('AI response: ' + msg);
  }
}

document.getElementById('userInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// Init
loadCanvases();
</script>
</body>
</html>"""

@app.route("/")
def index():
    if "user_id" not in session: return redirect("/login")
    return Response(INDEX_HTML, mimetype="text/html")

# ── Canvas Routes ─────────────────────────────────────────────────────────────
@app.route("/canvases", methods=["GET"])
def get_canvases():
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    try:
        uid = session["user_id"]
        cursor.execute("SELECT id, name, created_at FROM canvases WHERE owner_id=%s ORDER BY created_at DESC", (uid,))
        canvases = cursor.fetchall()
        return jsonify({"canvases": canvases, "user_email": session.get("user_email", "")})
    finally:
        cursor.close()
        conn.close()

@app.route("/canvas/create", methods=["POST"])
def create_canvas():
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    d = request.get_json()
    name = d.get("name", "Untitled Canvas")
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO canvases (owner_id, name, data) VALUES (%s, %s, %s) RETURNING id",
                      (session["user_id"], name, "{}"))
        canvas_id = cursor.fetchone()["id"]
        conn.commit()
        return jsonify({"ok": True, "canvas_id": canvas_id})
    finally:
        cursor.close()
        conn.close()

@app.route("/canvas/<int:canvas_id>", methods=["GET"])
def get_canvas(canvas_id):
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    try:
        uid = session["user_id"]
        # Check ownership or share
        cursor.execute("""
            SELECT data FROM canvases 
            WHERE id=%s AND (owner_id=%s OR id IN 
                (SELECT canvas_id FROM canvas_shares WHERE user_id=%s))
        """, (canvas_id, uid, uid))
        row = cursor.fetchone()
        if not row: return jsonify({"error": "not found"}), 404
        data = json.loads(row["data"]) if row["data"] else {}
        return jsonify(data)
    finally:
        cursor.close()
        conn.close()

@app.route("/canvas/<int:canvas_id>", methods=["DELETE"])
def delete_canvas(canvas_id):
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM canvases WHERE id=%s AND owner_id=%s", (canvas_id, session["user_id"]))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        cursor.close()
        conn.close()

@app.route("/canvas/<int:canvas_id>/save", methods=["POST"])
def save_canvas(canvas_id):
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    try:
        uid = session["user_id"]
        data = json.dumps(request.get_json(), ensure_ascii=False)
        cursor.execute("""
            UPDATE canvases SET data=%s, updated_at=CURRENT_TIMESTAMP 
            WHERE id=%s AND (owner_id=%s OR id IN 
                (SELECT canvas_id FROM canvas_shares WHERE user_id=%s))
        """, (data, canvas_id, uid, uid))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        cursor.close()
        conn.close()

@app.route("/canvas/<int:canvas_id>/share", methods=["POST"])
def share_canvas(canvas_id):
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    d = request.get_json()
    email = d.get("email", "").strip().lower()
    permission = d.get("permission", "edit")
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Get target user
        cursor.execute("SELECT id FROM users WHERE email=%s", (email,))
        target = cursor.fetchone()
        if not target: return jsonify({"error": "user not found"}), 404
        
        # Check ownership
        cursor.execute("SELECT owner_id FROM canvases WHERE id=%s", (canvas_id,))
        canvas = cursor.fetchone()
        if not canvas or canvas["owner_id"] != session["user_id"]:
            return jsonify({"error": "not authorized"}), 403
        
        # Add share
        cursor.execute("""
            INSERT INTO canvas_shares (canvas_id, user_id, permission) 
            VALUES (%s, %s, %s)
            ON CONFLICT (canvas_id, user_id) DO UPDATE SET permission=%s
        """, (canvas_id, target["id"], permission, permission))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        cursor.close()
        conn.close()

@app.route("/canvas/<int:canvas_id>/share", methods=["DELETE"])
def unshare_canvas(canvas_id):
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    d = request.get_json()
    email = d.get("email", "").strip().lower()
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email=%s", (email,))
        target = cursor.fetchone()
        if not target: return jsonify({"ok": True})
        
        cursor.execute("""
            DELETE FROM canvas_shares 
            WHERE canvas_id=%s AND user_id=%s AND canvas_id IN 
                (SELECT id FROM canvases WHERE owner_id=%s)
        """, (canvas_id, target["id"], session["user_id"]))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        cursor.close()
        conn.close()

@app.route("/canvas/<int:canvas_id>/shares", methods=["GET"])
def get_canvas_shares(canvas_id):
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT u.email, cs.permission 
            FROM canvas_shares cs 
            JOIN users u ON cs.user_id = u.id 
            WHERE cs.canvas_id=%s AND cs.canvas_id IN 
                (SELECT id FROM canvases WHERE owner_id=%s)
        """, (canvas_id, session["user_id"]))
        shares = cursor.fetchall()
        return jsonify({"shares": shares})
    finally:
        cursor.close()
        conn.close()

@app.route("/canvases/shared", methods=["GET"])
def get_shared_canvases():
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    try:
        uid = session["user_id"]
        cursor.execute("""
            SELECT c.id, c.name, u.email as owner_email 
            FROM canvases c
            JOIN canvas_shares cs ON c.id = cs.canvas_id
            JOIN users u ON c.owner_id = u.id
            WHERE cs.user_id=%s
            ORDER BY c.updated_at DESC
        """, (uid,))
        canvases = cursor.fetchall()
        return jsonify({"canvases": canvases})
    finally:
        cursor.close()
        conn.close()

@app.route("/users/search", methods=["GET"])
def search_users():
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    query = request.args.get("q", "").strip().lower()
    if len(query) < 2: return jsonify({"users": []})
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT email FROM users WHERE email LIKE %s LIMIT 5", (f"%{query}%",))
        users = cursor.fetchall()
        return jsonify({"users": users})
    finally:
        cursor.close()
        conn.close()

@app.route("/canvas/call", methods=["POST"])
def initiate_call():
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    d = request.get_json()
    canvas_id = d.get("canvas_id")
    target_email = d.get("target_email", "").strip().lower()
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email=%s", (target_email,))
        target = cursor.fetchone()
        if not target: return jsonify({"error": "user not found"}), 404
        
        # Emit call via SocketIO (would need user session tracking)
        socketio.emit('incoming_call', {
            'from_email': session.get("user_email"),
            'canvas_id': canvas_id
        }, room=f"user_{target['id']}")
        
        return jsonify({"ok": True})
    finally:
        cursor.close()
        conn.close()

# ── Socket.IO Events ──────────────────────────────────────────────────────────
@socketio.on('join_canvas')
def handle_join_canvas(data):
    canvas_id = data.get('canvas_id')
    join_room(f"canvas_{canvas_id}")
    
@socketio.on('leave_canvas')
def handle_leave_canvas(data):
    canvas_id = data.get('canvas_id')
    leave_room(f"canvas_{canvas_id}")

@socketio.on('canvas_update')
def handle_canvas_update(data):
    canvas_id = data.get('canvas_id')
    emit('canvas_update', {
        'nodes': data.get('nodes', []),
        'edges': data.get('edges', []),
        'groups': data.get('groups', []),
        'from_user': session.get('user_email', '')
    }, room=f"canvas_{canvas_id}", include_self=False)

@socketio.on('cursor_move')
def handle_cursor_move(data):
    canvas_id = data.get('canvas_id')
    emit('cursor_move', {
        'user': session.get('user_email', 'anonymous'),
        'x': data.get('x'),
        'y': data.get('y')
    }, room=f"canvas_{canvas_id}", include_self=False)

@socketio.on('accept_call')
def handle_accept_call(data):
    emit('call_accepted', {
        'user': session.get('user_email', 'anonymous'),
        'canvas_id': data.get('canvas_id')
    }, broadcast=True)

@socketio.on('decline_call')
def handle_decline_call(data):
    emit('call_declined', {
        'user': session.get('user_email', 'anonymous')
    }, broadcast=True)

# ── Groq API Calls (keeping your existing AI logic) ──────────────────────────
def call_groq(messages):
    r = requests.post(GROQ_URL, headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                      json={"model": GROQ_MODEL, "messages": messages}, timeout=60)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def classify_with_groq(user_input):
    sys = (f"Classify a message. Time: {datetime.now().strftime('%A %B %d %Y %H:%M PDT')}.\n"
           "Return ONLY JSON. Types: timer(+seconds), ai_command(+command), question, text.\n"
           'Examples: {"type":"timer","seconds":180} | {"type":"question"} | {"type":"text"}')
    raw = call_groq([{"role": "system", "content": sys}, {"role": "user", "content": user_input}])
    try:
        d = json.loads(raw)
        if isinstance(d, dict) and "type" in d: return d
    except: pass
    return {"type": "question"}

@app.route("/brainstorm", methods=["POST"])
def brainstorm():
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    d = request.get_json()
    topic = d.get("topic", "")
    sys = ('You are a brainstorm assistant. Analyze the topic and branch out conceptually. '
           'Generate necessary, highly related subtopics. The number of subtopics should fit the complexity '
           'of the topic (between 2 and 8). Return ONLY a valid JSON array of strings. Do not include markdown formatting. '
           'Example output: ["Subtopic A", "Subtopic B", "Subtopic C"]')
    try:
        raw = call_groq([{"role": "system", "content": sys}, {"role": "user", "content": topic}])
        clean = raw.strip().strip("```json").strip("```").strip()
        nodes = json.loads(clean)
        if isinstance(nodes, list):
            return jsonify({"nodes": nodes})
    except: pass
    return jsonify({"nodes": [f"{topic} idea 1", f"{topic} idea 2", f"{topic} idea 3"]})

@app.route("/save_settings", methods=["POST"])
def save_settings():
    if "user_id" not in session: return jsonify({"error": "unauthorized"}), 401
    conn = get_db()
    cursor = conn.cursor()
    try:
        uid = session["user_id"]
        settings_data = json.dumps(request.get_json(), ensure_ascii=False)
        cursor.execute("SELECT user_id FROM user_settings WHERE user_id=%s", (uid,))
        if cursor.fetchone():
            cursor.execute("UPDATE user_settings SET settings=%s WHERE user_id=%s", (settings_data, uid))
        else:
            cursor.execute("INSERT INTO user_settings (user_id, settings) VALUES (%s, %s)", (uid, settings_data))
        conn.commit()
    except Exception as e:
        conn.rollback()
    finally:
        cursor.close()
        conn.close()
    return jsonify({"ok": True})

@app.route("/load_settings", methods=["GET"])
def load_settings():
    if "user_id" not in session: return jsonify({}), 401
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT settings FROM user_settings WHERE user_id=%s", (session["user_id"],))
        row = cursor.fetchone()
        if not row: return jsonify({}), 404
        return jsonify(row['settings'])
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "4000"))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
