---
title: 'How to Set Up Your Own Private VPN on Alibaba Cloud'
description: A step-by-step guide to building your own VPN server with a permanent IP address, using only the Alibaba Cloud web console
publishDate: 'Sep 13 2026'
isFeatured: true
---

This guide shows you how to build your own private VPN server. When you connect to it, websites see the server's location instead of yours — useful if you're travelling or living abroad and want to reach services from your home country.

Everything here is done through the Alibaba Cloud website. You don't need to install any software on your computer, and you don't need to know how to use a terminal beforehand. You'll copy and paste a few commands into a window in your browser, and that's it.

**Time needed:** about 30 minutes.

## What you're building

Three pieces work together:

| Piece | What it does |
|---|---|
| **A server** (called an ECS instance) | A small computer in a data centre that your traffic passes through |
| **An Elastic IP** | A permanent internet address for that server, so it never changes |
| **WireGuard** | The VPN software that runs on the server and on your devices |

The Elastic IP matters more than it sounds. A regular server address gets thrown away every time you switch the server off, so you'd get a different one each time. Websites notice that and get suspicious. An Elastic IP stays yours, so you look like the same person every time you connect.

## What it costs

A small server costs a few dollars a month if you leave it running all the time. You can switch it off when you're not using it and pay much less — there's a section at the end explaining how.

The Elastic IP has its own small monthly fee that you pay whether the server is on or off. That's the price of keeping the same address permanently.

## Step 1: Create the server

1. Sign in to the [Alibaba Cloud console](https://www.alibabacloud.com/).
2. Search for **ECS** in the top search bar and open it.
3. Click **Create Instance**.

Now choose your settings. Most defaults are fine — these are the ones that matter:

**Region.** Pick the country you want to appear to be in. This is the whole point of the exercise, so choose carefully. If you want to look like you're in Indonesia, pick Jakarta.

**Instance type.** Choose the smallest and cheapest option available, something like 1 vCPU and 1 GB of memory. VPN software is very light and a small server handles it easily.

**Image.** Choose **Ubuntu**, version 24.04 or newer. This is the operating system the server runs.

**Network.** Leave this as VPC (the default).

**Public IP.** You can leave this switched off — we're adding a permanent address in the next step instead.

**Login credentials.** Choose **Password** and set a strong one. Write it down somewhere safe, because you'll need it shortly and there's no way to recover it later.

> **About the password:** pick something long and random, not a word you'd use elsewhere. This password protects a server that's reachable from the internet.

Click through to create the instance. It takes a minute or two to start up.

## Step 2: Give it a permanent address

1. In the console, search for **Elastic IP Address** and open it.
2. Click **Create EIP** (sometimes labelled **Apply for EIP**).
3. Choose the **same region** as your server — this is important, an EIP can only attach to a server in its own region.
4. For billing, **By bandwidth** is usually cheaper if you plan to watch video. Set the bandwidth to 5 Mbps or higher.
5. Create it.

Now attach it to your server:

1. Find your new EIP in the list.
2. Click **Bind** (or **Associate**).
3. Choose **ECS Instance** and pick the server you just made.

Write down the IP address it gives you — something like `47.250.10.20`. You'll need it later. This is your VPN's permanent address.

## Step 3: Open the right ports

A firewall sits in front of your server and blocks everything by default. You need to let two things through.

1. In the ECS console, open your instance.
2. Find the **Security Groups** tab and click into the security group attached to it.
3. Click **Add Rule** and create these two rules:

**Rule 1 — for the VPN itself:**

| Setting | Value |
|---|---|
| Direction | Inbound |
| Protocol | **UDP** |
| Port range | `51820/51820` |
| Source | `0.0.0.0/0` |

**Rule 2 — so you can manage the server:**

| Setting | Value |
|---|---|
| Direction | Inbound |
| Protocol | **TCP** |
| Port range | `22/22` |
| Source | `0.0.0.0/0` |

> **Watch the protocol column.** The dropdown usually defaults to TCP, and it's easy to create the VPN rule as TCP without noticing. WireGuard only uses **UDP**. If you get this wrong, everything will look correct but your devices will never connect, with no error message explaining why.

Rule 2 is often already there. If your home internet has a fixed address, you can put that address in the Source field instead of `0.0.0.0/0` to be safer, but `0.0.0.0/0` works fine to get started.

## Step 4: Open the browser terminal

Alibaba Cloud has a terminal built into the website, so you don't need any software on your computer.

1. Go back to your instance in the ECS console.
2. Click **Connect** (sometimes shown as **Remote Connection** or **Workbench**).
3. Choose the password option, enter `root` as the username, and use the password you set in Step 1.

A black window with text appears. This is the server's command line. You type commands here and press Enter, and the server does what you asked.

## Step 5: Install the VPN software

Copy the block below, paste it into that black window, and press Enter. On most browsers you paste with **Ctrl+V** (or **Cmd+V** on a Mac); if that doesn't work, right-click and choose Paste.

```bash
apt-get update && apt-get install -y wireguard qrencode
```

Wait for it to finish — you'll see a lot of text scroll by, which is normal. When the cursor stops and returns to a `#` prompt, it's done.

## Step 6: Set up the VPN

This next block does all the setup at once: it creates the secret keys, writes the configuration, and switches the VPN on.

Paste the whole thing in one go and press Enter:

```bash
cd /etc/wireguard
umask 077
NIC=$(ip route get 1.1.1.1 | grep -oP 'dev \K\S+')

wg genkey | tee server.key | wg pubkey > server.pub
wg genkey | tee phone.key | wg pubkey > phone.pub

cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
PrivateKey = $(cat server.key)
Address = 10.8.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $NIC -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $NIC -j MASQUERADE

[Peer]
PublicKey = $(cat phone.pub)
AllowedIPs = 10.8.0.2/32
EOF

echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
sysctl -p /etc/sysctl.d/99-wireguard.conf
systemctl enable --now wg-quick@wg0
```

In plain terms, that created two pairs of keys (one for the server, one for your phone), told the server to pass traffic through to the internet on your behalf, and started the VPN so it also comes back automatically whenever the server restarts.

Check it worked:

```bash
wg show
```

You should see a few lines mentioning `interface: wg0` and a listening port. If you do, the server side is finished.

## Step 7: Create your device's configuration

Now make the settings file your phone or laptop will use.

First, type this line — but **replace `47.250.10.20` with your own Elastic IP** from Step 2:

```bash
EIP=47.250.10.20
```

Then paste this block:

```bash
cat > /etc/wireguard/phone.conf <<EOF
[Interface]
PrivateKey = $(cat /etc/wireguard/phone.key)
Address = 10.8.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = $(cat /etc/wireguard/server.pub)
Endpoint = $EIP:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

qrencode -t ansiutf8 < /etc/wireguard/phone.conf
```

A QR code made of blocky characters appears right there in the browser window. That's your configuration, ready to scan.

## Step 8: Connect your devices

### On a phone (iPhone or Android)

1. Install the **WireGuard** app from the App Store or Play Store. It's free and made by the WireGuard project itself.
2. Open it and tap the **+** button.
3. Choose **Create from QR code** (or **Scan from QR code**).
4. Point your phone at the QR code on your screen.
5. Give it a name like "My VPN" and save.
6. Flip the switch to turn it on.

Your phone will ask permission to add a VPN configuration. That's expected — say yes.

### On a Mac or Windows computer

Phones can scan the code, but computers need the text. In the browser terminal, run:

```bash
cat /etc/wireguard/phone.conf
```

Then:

1. Select the text that appears and copy it.
2. Paste it into a plain text editor and save it as `myvpn.conf`.
3. Install the **WireGuard** app (Mac App Store, or from `wireguard.com/install` for Windows).
4. Open the app, choose **Import tunnel from file**, and pick your `myvpn.conf`.
5. Click **Activate**.

> **One configuration per device.** Don't scan the same QR code on your phone and your laptop. Two devices sharing one configuration will keep knocking each other offline. There's a section below on adding a second device properly.

## Step 9: Check that it's working

With the VPN switched on, visit a site like [whatismyipaddress.com](https://whatismyipaddress.com) on that device.

It should show your Elastic IP and the country your server is in. If it shows your real location instead, the VPN isn't carrying your traffic — see the troubleshooting section.

## Step 10: Switch it off to save money

You only pay for the server while it's running, so switch it off when you're not using it. The Elastic IP stays attached, so your address is exactly the same when you come back.

In the ECS console, find your instance and click **Stop**. Click **Start** when you want it back.

When you start it again, wait about 30 seconds before connecting — the server needs a moment to boot up. The VPN starts automatically, so there's nothing to reconfigure, ever.

> **Never release or unbind the Elastic IP.** Stopping the server is free to undo. Releasing the IP gives the address away permanently, and you'd get a different one next time — which defeats the main advantage of this setup.

## Optional: a one-tap switch for your phone

Signing into the console every time gets tedious. This section adds two buttons to your iPhone's Home Screen:

- **VPN On** — starts the server, waits for it to boot, connects the VPN
- **VPN Off** — disconnects the VPN, stops the server

This part is optional and takes about 20 extra minutes. Everything above works fine without it.

The idea is simple: you create a tiny program that lives in the cloud and does one thing — start or stop your server when it receives a request with the right password. Then your phone sends that request when you tap a button.

### Part A: Create a permission role

This role is what lets the program control your server, and **only** your server.

1. In the console, search for **RAM** and open it.
2. Go to **Policies** → **Create Policy** → choose the **JSON** tab.
3. Paste this in, then replace the three values marked below:

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ecs:DescribeInstances", "ecs:DescribeInstanceStatus"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["ecs:StartInstance", "ecs:StopInstance"],
      "Resource": "acs:ecs:YOUR_REGION:YOUR_ACCOUNT_ID:instance/YOUR_INSTANCE_ID"
    }
  ]
}
```

- `YOUR_REGION` — the region code, like `ap-southeast-5`. It's in the URL when you view your instance.
- `YOUR_ACCOUNT_ID` — a long number. Hover your profile picture at the top right of the console to see it.
- `YOUR_INSTANCE_ID` — starts with `i-`, shown on your instance's page.

Name the policy something like `vpn-switch-policy` and save.

> That second block is why this is safe to expose to the internet. Even if someone stole your password, the only thing they could do is turn this one server on and off. They can't touch anything else in your account.

4. Now go to **Roles** → **Create Role**.
5. Choose **Alibaba Cloud Service** as the trusted entity, and pick **Function Compute** as the service.
6. Name it `vpn-switch-role`.
7. After it's created, open it, click **Grant Permission**, and attach the `vpn-switch-policy` you just made.

### Part B: Create the program

1. In the console, search for **Function Compute** and open it.
2. Click **Create Function**.
3. Choose these settings:
   - **Runtime:** Python 3.10 (or any Python 3)
   - **Trigger / Handler type:** HTTP
   - **Authentication:** anonymous or none (our own password check handles security)
   - **Role:** the `vpn-switch-role` from Part A
4. Create it, then find the built-in code editor.

Delete whatever sample code is there and paste this in. Change the two marked lines at the top:

```python
import os, hmac, hashlib, base64, json, time, uuid
import urllib.parse, urllib.request

REGION = "ap-southeast-5"              # <-- change to your region
INSTANCE_ID = "i-xxxxxxxxxxxxxxxx"     # <-- change to your instance ID

SECRET = os.environ.get("SWITCH_TOKEN", "")
ENDPOINT = f"https://ecs.{REGION}.aliyuncs.com"


def _encode(s):
    return urllib.parse.quote(str(s), safe='~')


def _call_ecs(action, extra, creds):
    params = {
        "Action": action,
        "Version": "2014-05-26",
        "AccessKeyId": creds["key"],
        "SignatureMethod": "HMAC-SHA1",
        "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "SignatureVersion": "1.0",
        "SignatureNonce": uuid.uuid4().hex,
        "Format": "JSON",
        "RegionId": REGION,
    }
    if creds["token"]:
        params["SecurityToken"] = creds["token"]
    params.update(extra)

    canon = '&'.join(f"{_encode(k)}={_encode(v)}" for k, v in sorted(params.items()))
    to_sign = "GET&%2F&" + _encode(canon)
    digest = hmac.new((creds["secret"] + "&").encode(), to_sign.encode(), hashlib.sha1).digest()
    params["Signature"] = base64.b64encode(digest).decode()

    url = ENDPOINT + "/?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode())


def handler(environ, start_response):
    c = environ["fc.context"].credentials
    creds = {
        "key": c.access_key_id,
        "secret": c.access_key_secret,
        "token": c.security_token,
    }

    query = environ.get("QUERY_STRING", "")
    params = dict(p.split("=", 1) for p in query.split("&") if "=" in p)
    action = params.get("action", "status")

    def reply(status, data):
        start_response(status, [("Content-Type", "application/json")])
        return [json.dumps(data).encode()]

    if not SECRET or not hmac.compare_digest(environ.get("HTTP_X_AUTH_TOKEN", ""), SECRET):
        return reply("401 Unauthorized", {"error": "unauthorized"})

    try:
        if action == "start":
            _call_ecs("StartInstance", {"InstanceId": INSTANCE_ID}, creds)
            return reply("200 OK", {"result": "starting"})
        if action == "stop":
            _call_ecs("StopInstance", {"InstanceId": INSTANCE_ID}, creds)
            return reply("200 OK", {"result": "stopping"})
        if action == "status":
            r = _call_ecs("DescribeInstances", {"InstanceIds": json.dumps([INSTANCE_ID])}, creds)
            return reply("200 OK", {"status": r["Instances"]["Instance"][0]["Status"]})
        return reply("400 Bad Request", {"error": "unknown action"})
    except Exception as e:
        return reply("500 Internal Server Error", {"error": str(e)})
```

This code uses only what comes with Python, so there's nothing to install or upload — pasting it into the editor is genuinely all there is to it.

Notice the instance ID is written into the code rather than being something the request can ask for. That means this program can never be tricked into touching a different server.

### Part C: Set the password

1. Make up a long random password — 30 characters or more. A password manager's generator is ideal. Don't reuse one you use elsewhere.
2. In your function's settings, find **Environment Variables**.
3. Add one named exactly `SWITCH_TOKEN`, with your random password as the value.
4. Save and deploy the function.
5. Copy the function's **URL**. It looks something like `https://something.ap-southeast-5.fcapp.run`.

Keep the URL and the password together somewhere safe — you need both in the next part.

### Part D: Build the buttons

On your iPhone, open the **Shortcuts** app.

**The "VPN On" button:**

1. Tap **+** to make a new shortcut and name it `VPN On`.
2. Add the action **Get Contents of URL**.
3. In the URL field, enter your function URL followed by `/?action=start` — for example `https://something.ap-southeast-5.fcapp.run/?action=start`
4. Tap the arrow to expand the action's options, then set:
   - **Method:** POST
   - **Headers:** add one with key `X-Auth-Token` and your password as the value
5. Add the action **Wait** and set it to 30 seconds. (The server needs time to boot.)
6. Add the action **Set VPN**, pick your WireGuard tunnel, and set it to **On**.
7. Save.

**The "VPN Off" button:**

Same idea, reversed:

1. New shortcut named `VPN Off`.
2. Add **Set VPN**, your tunnel, set to **Off**.
3. Add **Get Contents of URL** with `/?action=stop` at the end, POST, and the same `X-Auth-Token` header.
4. Save.

Turning the VPN off before stopping the server matters — otherwise your phone keeps trying to reach a server that's shutting down.

**Put them on your Home Screen:** open a shortcut, tap the share icon, choose **Add to Home Screen**. You can also give each one a Siri phrase in its settings, so "Hey Siri, VPN on" just works.

### If a button doesn't work

Tap the shortcut and watch what it returns:

| Response | Meaning |
|---|---|
| `{"error": "unauthorized"}` | The password in the header doesn't match `SWITCH_TOKEN`. Check for a stray space. |
| `{"status": "Running"}` | It's working — the server is already on. |
| A permission error | The role from Part A isn't attached to the function, or the policy values are wrong. |
| Nothing at all | Check the URL, and make sure the `/?action=start` part is on the end. |

## Adding another device

Each device needs its own keys. In the browser terminal, run this to add a second one:

```bash
cd /etc/wireguard
umask 077
wg genkey | tee laptop.key | wg pubkey > laptop.pub

cat >> /etc/wireguard/wg0.conf <<EOF

[Peer]
PublicKey = $(cat laptop.pub)
AllowedIPs = 10.8.0.3/32
EOF

systemctl restart wg-quick@wg0

cat > /etc/wireguard/laptop.conf <<EOF
[Interface]
PrivateKey = $(cat laptop.key)
Address = 10.8.0.3/32
DNS = 1.1.1.1

[Peer]
PublicKey = $(cat server.pub)
Endpoint = $EIP:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

qrencode -t ansiutf8 < /etc/wireguard/laptop.conf
```

For a third device, repeat it but change `laptop` to another name and `10.8.0.3` to `10.8.0.4`, and so on.

> If you've reconnected to the terminal since Step 7, set `EIP=` to your address again first, otherwise the configuration will come out with a blank address.

## Troubleshooting

| Problem | Likely cause |
|---|---|
| VPN connects but no internet | The `AllowedIPs` line should be `0.0.0.0/0`. Check you copied the whole configuration. |
| Never connects, no error shown | The firewall rule is set to TCP instead of **UDP**. Go back to Step 3 and check. |
| Worked before, stopped working | The server is switched off. Start it in the console and wait 30 seconds. |
| Still shows your real country | The VPN isn't switched on, or the app is connected to a different tunnel. Check the toggle in the WireGuard app. |
| Drops in and out randomly | Two devices are sharing one configuration. Give each device its own. |
| Can't connect to the terminal | Wrong password, or the SSH rule (port 22) is missing from the security group. |

## Security basics

A few things worth doing once everything works:

- **Keep your configuration files private.** Each one contains a key that grants full access to your VPN. Don't email them or post them in group chats.
- **Narrow the SSH rule.** If your home internet address doesn't change, edit Rule 2 from Step 3 to allow only that address instead of `0.0.0.0/0`.
- **Keep the server updated.** Every month or so, connect to the terminal and run `apt-get update && apt-get upgrade -y`.

That's the whole setup. One small server, one permanent address, and a switch on your phone.
