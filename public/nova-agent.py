import json
import os
import subprocess
import threading
import webbrowser
import pyperclip
from http.server import BaseHTTPRequestHandler, HTTPServer
import tkinter as tk
from tkinter import messagebox, ttk

CONSENT_FILE = "nova_consent.accepted"
PORT = 5050
automation_enabled = False
stop_requested = False

# ======================
# CONSENT UI (RUNS ONCE)
# ======================

def require_consent():
    if os.path.exists(CONSENT_FILE):
        return True

    root = tk.Tk()
    root.title("Nova - Local Agent Setup")
    root.geometry("520x380")
    root.resizable(False, False)
    root.configure(bg="#0a0a0a")

    agreed = tk.BooleanVar()
    result = {"consented": False}

    style = ttk.Style()
    style.configure("Dark.TCheckbutton", background="#0a0a0a", foreground="white")

    tk.Label(root, text="Nova Local Agent", font=("Segoe UI", 18, "bold"), 
             bg="#0a0a0a", fg="white").pack(pady=(20, 5))
    
    tk.Label(root, text="Your Intelligent Automation Partner", font=("Segoe UI", 10), 
             bg="#0a0a0a", fg="#888").pack(pady=(0, 20))

    permissions = [
        "• Execute AI-generated automation plans locally",
        "• Access files and folders on your device",
        "• Copy/paste to clipboard",
        "• Open URLs and applications",
        "• Run shell commands when approved",
    ]
    
    frame = tk.Frame(root, bg="#1a1a1a", padx=20, pady=15)
    frame.pack(padx=20, fill="x")
    
    tk.Label(frame, text="This agent will:", font=("Segoe UI", 10, "bold"),
             bg="#1a1a1a", fg="white", anchor="w").pack(fill="x")
    
    for p in permissions:
        tk.Label(frame, text=p, font=("Segoe UI", 9), bg="#1a1a1a", 
                 fg="#ccc", anchor="w").pack(fill="x", pady=1)

    tk.Label(root, text="You control everything. Stop anytime by closing this app.",
             font=("Segoe UI", 9), bg="#0a0a0a", fg="#666").pack(pady=15)

    cb = tk.Checkbutton(root, text="I give explicit consent to run this agent",
                        variable=agreed, bg="#0a0a0a", fg="white",
                        selectcolor="#333", activebackground="#0a0a0a",
                        activeforeground="white", font=("Segoe UI", 10))
    cb.pack()

    def confirm():
        if agreed.get():
            with open(CONSENT_FILE, "w") as f:
                f.write("consented")
            result["consented"] = True
            root.destroy()
        else:
            messagebox.showerror("Consent Required", "You must check the consent box to continue.")

    def decline():
        root.destroy()

    btn_frame = tk.Frame(root, bg="#0a0a0a")
    btn_frame.pack(pady=20)

    tk.Button(btn_frame, text="Decline", command=decline, width=12,
              bg="#333", fg="white", relief="flat", font=("Segoe UI", 10)).pack(side="left", padx=5)
    tk.Button(btn_frame, text="Accept & Continue", command=confirm, width=15,
              bg="#3b82f6", fg="white", relief="flat", font=("Segoe UI", 10, "bold")).pack(side="left", padx=5)

    root.mainloop()
    return result["consented"]

# ======================
# AUTOMATION EXECUTORS
# ======================

def execute_step(step):
    global stop_requested
    if stop_requested:
        return {"step": step, "status": "stopped", "error": "User stopped execution"}

    action = step.get("action", "").lower()
    params = step.get("params", {})

    try:
        if action == "open_url":
            url = params.get("url", "")
            webbrowser.open(url)
            return {"step": step, "status": "done", "result": f"Opened {url}"}

        elif action == "open_app":
            app = params.get("app", "")
            if os.name == "nt":
                os.startfile(app)
            else:
                subprocess.Popen([app])
            return {"step": step, "status": "done", "result": f"Opened {app}"}

        elif action == "copy_to_clipboard":
            text = params.get("text", "")
            pyperclip.copy(text)
            return {"step": step, "status": "done", "result": "Copied to clipboard"}

        elif action == "read_file":
            path = params.get("path", "")
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            return {"step": step, "status": "done", "result": content[:1000]}

        elif action == "write_file":
            path = params.get("path", "")
            content = params.get("content", "")
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            return {"step": step, "status": "done", "result": f"Wrote to {path}"}

        elif action == "list_files":
            path = params.get("path", ".")
            files = os.listdir(path)
            return {"step": step, "status": "done", "result": files}

        elif action == "run_command":
            cmd = params.get("command", "")
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            return {"step": step, "status": "done", "result": result.stdout or result.stderr}

        elif action == "wait":
            import time
            seconds = params.get("seconds", 1)
            time.sleep(seconds)
            return {"step": step, "status": "done", "result": f"Waited {seconds}s"}

        else:
            return {"step": step, "status": "error", "error": f"Unknown action: {action}"}

    except Exception as e:
        return {"step": step, "status": "error", "error": str(e)}

# ======================
# HTTP SERVER
# ======================

class AgentHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "running",
                "automation_enabled": automation_enabled,
                "version": "1.0.0"
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        global stop_requested

        if self.path == "/execute":
            if not automation_enabled:
                self.send_response(403)
                self.send_header("Content-Type", "application/json")
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "error",
                    "error": "Automation mode is disabled"
                }).encode())
                return

            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            payload = json.loads(body.decode())
            steps = payload.get("steps", [])

            stop_requested = False
            results = []

            for step in steps:
                if stop_requested:
                    results.append({"step": step, "status": "stopped"})
                    break
                result = execute_step(step)
                results.append(result)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "completed",
                "results": results
            }).encode())

        elif self.path == "/stop":
            stop_requested = True
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "stopped"}).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass

def start_server():
    server = HTTPServer(("localhost", PORT), AgentHandler)
    print(f"Nova Agent running on http://localhost:{PORT}")
    server.serve_forever()

# ======================
# MAIN UI (CONTROL PANEL)
# ======================

def run_control_panel():
    global automation_enabled, stop_requested

    root = tk.Tk()
    root.title("Nova Agent")
    root.geometry("300x200")
    root.resizable(False, False)
    root.configure(bg="#0a0a0a")

    tk.Label(root, text="Nova Agent", font=("Segoe UI", 14, "bold"),
             bg="#0a0a0a", fg="white").pack(pady=(15, 5))

    status_label = tk.Label(root, text="Status: Idle", font=("Segoe UI", 10),
                            bg="#0a0a0a", fg="#888")
    status_label.pack()

    def toggle_automation():
        global automation_enabled
        automation_enabled = not automation_enabled
        if automation_enabled:
            toggle_btn.configure(text="Disable Automation", bg="#ef4444")
            status_label.configure(text="Status: ACTIVE", fg="#22c55e")
        else:
            toggle_btn.configure(text="Enable Automation", bg="#3b82f6")
            status_label.configure(text="Status: Idle", fg="#888")

    def stop_execution():
        global stop_requested
        stop_requested = True
        status_label.configure(text="Status: Stopped", fg="#f59e0b")

    toggle_btn = tk.Button(root, text="Enable Automation", command=toggle_automation,
                           width=20, bg="#3b82f6", fg="white", relief="flat",
                           font=("Segoe UI", 10, "bold"))
    toggle_btn.pack(pady=15)

    tk.Button(root, text="Stop Current Task", command=stop_execution,
              width=20, bg="#333", fg="white", relief="flat",
              font=("Segoe UI", 9)).pack()

    tk.Label(root, text=f"Listening on localhost:{PORT}", font=("Segoe UI", 8),
             bg="#0a0a0a", fg="#555").pack(pady=15)

    root.protocol("WM_DELETE_WINDOW", lambda: (root.destroy(), os._exit(0)))
    root.mainloop()

# ======================
# START
# ======================

if __name__ == "__main__":
    if not require_consent():
        print("Consent declined. Exiting.")
        exit(0)

    threading.Thread(target=start_server, daemon=True).start()
    run_control_panel()
