---
title: 'Building a Private WireGuard VPN on Alibaba Cloud ECS with a Persistent Elastic IP'
description: A complete guide to self-hosting a WireGuard VPN on a pay-as-you-go ECS instance, with a persistent Elastic IP and a one-tap iOS control switch
publishDate: 'Sep 13 2026'
isFeatured: true
---

Living abroad comes with a small, persistent annoyance: a good chunk of the internet decides what you're allowed to see based on where your packets come from. Home-region streaming services, banking portals, government sites — all of them look at your IP address and make assumptions.

Commercial VPNs solve this, sort of. But they come with their own problems: shared IP pools that get flagged, addresses that change every time you reconnect, and the small matter of routing all your traffic through a company you have no relationship with.

So I built my own. This guide walks through the whole thing: a WireGuard server on a single Alibaba Cloud ECS instance in Jakarta, a **persistent Elastic IP** so my apparent identity never changes, cost control so I'm not paying for an idle box, and a one-tap iOS shortcut to turn the whole thing on and off from my phone.

Total cost: roughly the price of a coffee per month, if you stop the instance when you're not using it.

## Architecture

The setup is deliberately boring, which is the point:

```
[ Your phone / laptop ]
          │
          │  WireGuard tunnel (UDP 51820)
          ▼
[ ECS instance in target region ]  ←── Elastic IP (persistent, never changes)
          │
          │  NAT / masquerade via eth0
          ▼
     [ The internet ]
```

Three pieces do the work:

- **The ECS instance** runs WireGuard and forwards traffic.
- **The Elastic IP (EIP)** is the crucial bit. A normal auto-assigned public IP is released every time you stop the instance, so you'd get a different address each session. An EIP stays bound to the instance whether it's running or stopped, which means the services you visit see one stable address forever.
- **A Function Compute webhook** (optional, covered at the end) lets you start and stop the instance from your phone without opening a cloud console.

## Part 1: Provision the instance

Create a pay-as-you-go ECS instance. The specs genuinely don't matter much — WireGuard is extraordinarily light, and the kernel does the encryption. A burstable `ecs.t5` with 1 vCPU and 1–2 GB RAM will comfortably saturate far more bandwidth than your EIP is provisioned for.

What matters:

- **Image**: Ubuntu 24.04 or 26.04 LTS. WireGuard has been in the mainline Linux kernel since 5.6, so there's no module compilation involved.
- **Network**: VPC (not classic).
- **Key pair**: create one and download the `.pem`. Don't use password auth.
- **Region**: whichever region you want to *appear* to be in. This is the entire point of the exercise, so choose deliberately.

Then **bind an Elastic IP** to it. In the console this is under the instance's actions menu. Pick `PayByBandwidth` if you want a predictable flat monthly cost rather than per-GB billing — for streaming, flat bandwidth billing is almost always cheaper.

Finally, fix the permissions on your key locally, or SSH will refuse to use it:

```bash
chmod 400 ~/my-key.pem
```

## Part 2: The private IP trap

Here's the first thing that will waste an hour of your life.

The ECS console shows your instance has a private IP like `172.31.250.193`. You try to connect:

```bash
ssh -v -i ~/my-key.pem root@172.31.250.193
```

And it just hangs, then dies:

```
debug1: Connecting to 172.31.250.193 [172.31.250.193] port 22.
debug1: connect to address 172.31.250.193 port 22: Operation timed out
```

That address is in the `172.16.0.0/12` RFC 1918 private range. It's your instance's **internal VPC address** — routable only from inside that VPC. Your laptop, sitting on the public internet, has no path to it whatsoever.

The tell is in the verbose output: SSH never got past `connect`. There's no protocol banner, no key exchange, no authentication attempt. When people see a timeout here they usually start second-guessing their key file or the `root` username, but neither of those has even been consulted yet. A timeout at the `connect` stage is *always* a routing or firewall problem, never a credentials problem.

Use the **Elastic IP** instead:

```bash
ssh -v -i ~/my-key.pem root@<YOUR_EIP>
```

A successful connection looks like this, and note how much further it gets before doing anything with your key:

```
debug1: Remote protocol version 2.0, remote software version OpenSSH_10.2p1
debug1: Authenticating to <YOUR_EIP>:22 as 'root'
debug1: Server host key: ssh-ed25519 SHA256:...
debug1: Will attempt key: /Users/you/my-key.pem explicit
Authenticated to <YOUR_EIP> ([<YOUR_EIP>]:22) using "publickey".
```

## Part 3: Install and configure WireGuard

SSH in and install the tooling. `qrencode` is there so we can generate a scannable config for mobile clients later:

```bash
apt-get update
apt-get install -y wireguard wireguard-tools qrencode
```

Before writing configs, find your instance's main network interface — the NAT rule below depends on getting this right:

```bash
ip route get 1.1.1.1
```

On Alibaba Cloud this is almost always `eth0`. On other providers it may be `ens5`, `enp1s0`, or similar. Substitute accordingly.

### Generate keys

WireGuard's key model is refreshingly simple: every peer has a private key and a public key, and each side is configured with its own private key and the other side's public key. That's the entire trust model — no certificate authorities, no handshake negotiation of cipher suites.

```bash
mkdir -p /etc/wireguard && cd /etc/wireguard
umask 077

wg genkey | tee server_private.key | wg pubkey > server_public.key
wg genkey | tee client_phone_private.key | wg pubkey > client_phone_public.key
```

The `umask 077` matters. WireGuard will complain loudly about world-readable key files, and it's right to.

### Server config

Create `/etc/wireguard/wg0.conf`:

```ini
[Interface]
PrivateKey = <CONTENTS_OF_server_private.key>
Address = 10.8.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = <CONTENTS_OF_client_phone_public.key>
AllowedIPs = 10.8.0.2/32
```

Worth understanding rather than just pasting:

- `10.8.0.0/24` is the private subnet that exists *inside* the tunnel. The server is `.1`, each client gets its own address. This range is arbitrary — just don't pick something that collides with a network you actually use.
- The `PostUp` rules are what turn this from "a tunnel" into "a VPN." The two `FORWARD` rules permit traffic to pass through the box, and `MASQUERADE` rewrites the source address of outbound packets to the instance's own address — which is what makes your traffic emerge wearing the EIP. `PostDown` tears the same rules down so they don't accumulate on every restart.
- `AllowedIPs` in a `[Peer]` block on the **server** means "which source addresses am I willing to accept from this peer." It means something quite different on the client, as we'll see.

### Enable forwarding and start

By default Linux will not route packets between interfaces. Turn that on persistently:

```bash
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
sysctl -p /etc/sysctl.d/99-wireguard.conf

systemctl enable --now wg-quick@wg0
```

`enable --now` both starts it immediately and registers it to start on boot — important, because we're going to be stopping and starting this instance a lot to save money, and you don't want to SSH in every time to bring the tunnel up.

Verify:

```bash
wg show
ss -uln | grep 51820
```

You should see the interface with its public key and listening port, and a UDP socket bound to `51820`.

## Part 4: The security group trap

This one is sneaky, and I walked straight into it.

When you create an inbound security group rule, the protocol dropdown defaults to TCP, and it's very easy to add a rule labelled "WireGuard" on port 51820 without noticing. **WireGuard is UDP.** A TCP rule on port 51820 does absolutely nothing for it.

The symptom is maddening: the server looks perfectly healthy, `wg show` is happy, the port is bound — and the client just sits there with no handshake, forever, with no error message. WireGuard is designed to be silent to unsolicited traffic, so there's no rejection to observe.

Add an inbound rule for **UDP** port `51820`. Via CLI:

```bash
aliyun ecs AuthorizeSecurityGroup \
  --region <YOUR_REGION> \
  --SecurityGroupId <YOUR_SG_ID> \
  --IpProtocol UDP \
  --PortRange 51820/51820 \
  --SourceCidrIp 0.0.0.0/0 \
  --Priority 1 \
  --Description "WireGuard UDP"
```

While you're in there: the default security group on a fresh instance usually allows **SSH from `0.0.0.0/0`**. Since you're using key-only auth that isn't catastrophic, but there's no reason to let the entire internet knock on port 22. Narrow that rule to your own address range if your ISP gives you something stable.

## Part 5: Client configuration

Create the client config. This one lives on your device, not the server, though it's convenient to generate it server-side:

```ini
[Interface]
PrivateKey = <CONTENTS_OF_client_phone_private.key>
Address = 10.8.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = <CONTENTS_OF_server_public.key>
Endpoint = <YOUR_EIP>:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

The important lines:

- **`AllowedIPs = 0.0.0.0/0`** — on the client this means "route *everything* through the tunnel." This is what makes it a full VPN rather than a split tunnel reaching a private network. If you only wanted to reach resources inside the VPC, you'd put the VPC CIDR here instead.
- **`DNS = 1.1.1.1`** — without this your device keeps using your local resolver, and DNS queries leak outside the tunnel. Many geo-detection systems look at resolver location, so skipping this can defeat the whole purpose.
- **`PersistentKeepalive = 25`** — sends a tiny packet every 25 seconds to hold the NAT mapping open. Essential on mobile networks and behind home routers, which otherwise silently drop idle UDP mappings after a minute or two.

### Getting it onto your devices

**macOS / Windows**: install the official WireGuard app, then *Import tunnel from file* and activate.

**iOS / Android**: the nicest path is a QR code. On the server:

```bash
qrencode -t PNG -o /tmp/client_qr.png -r /etc/wireguard/client_phone.conf
```

Copy it down with `scp`, open the WireGuard app, and use **Add → Scan from QR code**. Then delete the temporary file from the server — it's a plaintext private key sitting in `/tmp`:

```bash
shred -u /tmp/client_qr.png
```

**One client per config.** It's tempting to scan the same QR on your phone and your laptop, but two devices sharing one keypair will fight over the peer's session and you'll get intermittent, baffling drops. Generate a second keypair, add a second `[Peer]` block to the server with `AllowedIPs = 10.8.0.3/32`, and reload.

**Google TV / smart TVs** are a special case — the Play Store on Google TV won't offer the WireGuard app, and most TV devices have no camera for QR scanning. Your options are sideloading the APK and importing a config file, or running WireGuard as a *client* on your router (or a cheap travel router), which transparently covers every device on the network without per-device setup. The router approach is usually the right answer for a living room.

## Part 6: Verify it actually works

Don't trust it until you've checked the thing you actually care about: the address the outside world sees.

From the server, confirm its egress matches the EIP:

```bash
curl -s ifconfig.me
```

That should print your EIP exactly. Then confirm the NAT and forwarding rules are live:

```bash
iptables -t nat -L POSTROUTING -n -v
iptables -L FORWARD -n -v
```

You should see a `MASQUERADE` target on `eth0` and two `ACCEPT` rules referencing `wg0`.

Finally, with the tunnel **active on your client**, visit any "what is my IP" service from the client device. If it shows your EIP, you're done. If it shows your real address, the tunnel isn't actually carrying your traffic — check `AllowedIPs` on the client.

## Part 7: Controlling cost

This is where the pay-as-you-go model earns its keep, provided you understand what actually stops billing.

| Resource | Billed while instance is stopped? |
|---|---|
| vCPU + memory | **No** — this is the bulk of the cost |
| System disk | **Yes** — but it's cents per month |
| Elastic IP | **Yes** — it's a separate resource |

So: **stop the instance when you're not using it, but never release the EIP.** Releasing it would save a little more, and cost you the one thing the entire design exists to provide — a stable address. An EIP bound to a stopped instance keeps that exact address waiting for you.

```bash
aliyun ecs StopInstance --region <YOUR_REGION> --InstanceId <YOUR_INSTANCE_ID>
aliyun ecs StartInstance --region <YOUR_REGION> --InstanceId <YOUR_INSTANCE_ID>
```

Because we used `systemctl enable`, WireGuard comes back automatically on boot. Start the instance, wait roughly 20–30 seconds, connect. No reconfiguration, ever.

## Part 8: A one-tap switch for your phone

Running CLI commands to start a VPN rather defeats the convenience. The cloud provider's mobile app works but buries the control several menus deep. What I actually wanted was a Home Screen button.

The design: a small serverless function exposing an authenticated HTTP endpoint that can start, stop, and report status on exactly one instance — driven from an iOS Shortcut.

### Least privilege first

Before writing any code, create a RAM role the function will assume, scoped as tightly as it will go. If this endpoint is ever compromised, the blast radius should be "someone can toggle my VPN box," not "someone owns my cloud account."

Trust policy, allowing Function Compute to assume the role:

```json
{
  "Version": "1",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Effect": "Allow",
      "Principal": { "Service": ["fc.aliyuncs.com"] }
    }
  ]
}
```

Permission policy. Note the split: ECS `Describe*` calls are list operations that don't support resource-level authorization, so they need `"*"`, while the state-changing actions are pinned to a single instance ARN:

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
      "Resource": "acs:ecs:<REGION>:<ACCOUNT_ID>:instance/<YOUR_INSTANCE_ID>"
    }
  ]
}
```

Assign this role to the Function Compute service. The function then receives **temporary STS credentials at runtime** through its invocation context — meaning there are no long-lived access keys embedded anywhere in your code or environment variables. This is worth the extra setup step.

### The function

One important design choice: **zero third-party dependencies.**

My first attempt imported the vendor's Python SDK. I packaged it on a Mac, uploaded it, and got:

```
ImportError: /code/cryptography/hazmat/bindings/_rust.abi3.so: invalid ELF header
```

The `cryptography` package ships compiled native code. I'd built it for macOS ARM; the function runs on Linux x86-64. Rebuilding with `pip install --platform manylinux2014_x86_64 --only-binary=:all:` got me past that, straight into a *second* failure — a version mismatch between the Rust bindings and the Python layer.

At which point the better answer became obvious. Alibaba's RPC signing algorithm is just HMAC-SHA1 over a canonicalized query string, which Python's standard library does natively. Dropping the SDK took the deployment package from 6 MB of fragile native binaries to a single 1.5 KB file with nothing to break:

```python
import os, hmac, hashlib, base64, json, time, uuid
import urllib.parse, urllib.request, urllib.error

REGION = "<YOUR_REGION>"
INSTANCE_ID = "<YOUR_INSTANCE_ID>"
SECRET = os.environ.get("SWITCH_TOKEN", "")
ENDPOINT = f"https://ecs.{REGION}.aliyuncs.com"


def _percent_encode(s):
    return urllib.parse.quote(str(s), safe='~')


def _sign(params, access_key_secret):
    canonicalized = '&'.join(
        f"{_percent_encode(k)}={_percent_encode(v)}" for k, v in sorted(params.items())
    )
    string_to_sign = "GET&%2F&" + _percent_encode(canonicalized)
    key = (access_key_secret + "&").encode()
    digest = hmac.new(key, string_to_sign.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def _call_ecs(action, extra_params, creds):
    params = {
        "Action": action,
        "Version": "2014-05-26",
        "AccessKeyId": creds["access_key_id"],
        "SignatureMethod": "HMAC-SHA1",
        "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "SignatureVersion": "1.0",
        "SignatureNonce": uuid.uuid4().hex,
        "Format": "JSON",
        "RegionId": REGION,
    }
    if creds.get("security_token"):
        params["SecurityToken"] = creds["security_token"]
    params.update(extra_params)
    params["Signature"] = _sign(params, creds["access_key_secret"])

    url = ENDPOINT + "/?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=10) as resp:
        return json.loads(resp.read().decode())


def handler(environ, start_response):
    c = environ["fc.context"].credentials
    creds = {
        "access_key_id": c.access_key_id,
        "access_key_secret": c.access_key_secret,
        "security_token": c.security_token,
    }

    qs = environ.get("QUERY_STRING", "")
    params = dict(x.split("=", 1) for x in qs.split("&") if "=" in x)
    action = params.get("action", "status")
    token = environ.get("HTTP_X_AUTH_TOKEN", "")

    if not SECRET or not hmac.compare_digest(token, SECRET):
        start_response("401 Unauthorized", [("Content-Type", "application/json")])
        return [json.dumps({"error": "unauthorized"}).encode()]

    try:
        if action == "start":
            _call_ecs("StartInstance", {"InstanceId": INSTANCE_ID}, creds)
            result = {"action": "start", "result": "requested"}
        elif action == "stop":
            _call_ecs("StopInstance", {"InstanceId": INSTANCE_ID}, creds)
            result = {"action": "stop", "result": "requested"}
        elif action == "status":
            resp = _call_ecs("DescribeInstances", {"InstanceIds": json.dumps([INSTANCE_ID])}, creds)
            result = {"action": "status", "status": resp["Instances"]["Instance"][0]["Status"]}
        else:
            start_response("400 Bad Request", [("Content-Type", "application/json")])
            return [json.dumps({"error": "invalid action"}).encode()]
    except Exception as e:
        start_response("500 Internal Server Error", [("Content-Type", "application/json")])
        return [json.dumps({"error": str(e)}).encode()]

    start_response("200 OK", [("Content-Type", "application/json")])
    return [json.dumps(result).encode()]
```

Two security properties worth calling out:

- **`hmac.compare_digest`** rather than `==` for the token check. String equality short-circuits on the first differing byte, which leaks timing information an attacker can use to recover a secret byte by byte. Constant-time comparison closes that.
- **The instance ID is hardcoded server-side**, never accepted as a request parameter. Even with a leaked token, there is no way to point this endpoint at a different machine. Combined with the scoped RAM role, that's two independent layers saying the same thing.

Deploy it with an HTTP trigger, and set `SWITCH_TOKEN` to a strong random value:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Test before wiring up your phone — verify that it rejects as loudly as it accepts:

```bash
curl -s -w "\n%{http_code}\n" "https://<YOUR_FUNCTION_URL>/?action=status"
# {"error": "unauthorized"}
# 401

curl -s -H "X-Auth-Token: <YOUR_TOKEN>" -w "\n%{http_code}\n" \
  "https://<YOUR_FUNCTION_URL>/?action=status"
# {"action": "status", "status": "Running"}
# 200
```

### The iOS Shortcut

In the Shortcuts app, create a shortcut with a single **Get Contents of URL** action:

- **URL**: `https://<YOUR_FUNCTION_URL>/?action=start`
- **Method**: POST
- **Headers**: `X-Auth-Token` → your token

Then the satisfying part — chain it into one button that does everything:

1. **Get Contents of URL** → `action=start`
2. **Wait** → 20 seconds (the instance needs to boot)
3. **Set VPN** → your WireGuard tunnel → On

Build the mirror image for teardown — **Set VPN** off, then `action=stop` — and you have a two-button system. Share sheet → *Add to Home Screen* gives each one an icon; assigning a Siri phrase means you can turn on your VPN without touching anything.

Disconnect the VPN *before* stopping the instance, incidentally. Stopping it first leaves the client hammering a dead endpoint.

## What I'd tell someone starting this

Most of the time I lost went to three things, none of which were WireGuard itself:

1. **A timeout is not an auth failure.** Read the verbose SSH output and notice *how far* the connection got. Anything failing at `connect` is routing or firewall, full stop.
2. **Check the protocol, not just the port.** UDP versus TCP in a security group produces a failure with no error message at all.
3. **Native dependencies are a liability in serverless.** If the platform's API is signable with the standard library, sign it with the standard library. A 1.5 KB function with zero dependencies has almost nothing that can break at runtime.

WireGuard itself was the easy part. Under 20 lines of config, and it's been completely stable since — a single persistent address that makes the internet treat me as though I never left.
