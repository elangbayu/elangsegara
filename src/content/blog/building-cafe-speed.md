---
title: Building CafeSpeed - A Community Platform for Trusted Cafe WiFi Reviews
excerpt: Why I built a location-verified platform for sharing real cafe internet speed measurements
publishDate: 'Apr 17 2026'
tags:
  - Project
  - Web Development
isFeatured: true
seo:
  image:
    src: '/cafe-speed-homepage.webp'
    alt: CafeSpeed homepage showing cafe list with speed measurements
---

<p align="center">
  <img src="/cafe-speed-homepage.webp" />
  <i>CafeSpeed homepage - Community-sourced cafe internet speed measurements</i>
</p>

As remote work and digital nomadism continue to grow, finding a reliable cafe with good internet has become a daily challenge for many of us. I found myself constantly wondering: "Will this cafe actually have the WiFi speed I need to join my video call?" That frustration led me to build [CafeSpeed](https://cafe-speed.pages.dev), a community-sourced platform for trusted internet reviews of cafes.

## Why I Built CafeSpeed

The problem was clear: existing review platforms often have outdated or unreliable WiFi information. Someone might claim a cafe has "great WiFi," but what does that actually mean? 5 Mbps? 50 Mbps? And was that review from yesterday or two years ago?

**I wanted to create a platform where:**
- WiFi speed data is **objective and measurable** (actual Mbps, not subjective opinions)
- Reviews are **verified and trustworthy** (submitted by real people at the actual location)
- Information is **current and community-maintained** (crowdsourced from regular cafe-goers)

The goal was simple: help people make informed decisions about where to work based on real, verified internet speed data.

## Main Feature: Upload Your Speedtest

The core functionality of CafeSpeed is beautifully straightforward - when you're at a cafe, you can run a speedtest and submit the results directly to that cafe's profile.

<p align="center">
  <img src="/cafe-speed-history.webp" />
  <i>Measurement history showing multiple speed test submissions over time</i>
</p>

Each submission includes:
- **Download and upload speeds** (the numbers that actually matter)
- **Latency measurements** (crucial for video calls)
- **Timestamp** (so you know how recent the data is)
- **Network information** (which ISP the cafe uses)
- **Submitter identity** (for accountability)

The platform displays historical measurements, showing how a cafe's internet performs over time. This is invaluable - a cafe might have great speeds in the morning but struggle during peak hours. Multiple measurements paint a more accurate picture than any single review ever could.

## Anti-Tampering: Location Verification

Here's where CafeSpeed gets interesting. The biggest challenge in building a crowd-sourced review platform is preventing fake or misleading submissions. How do you ensure people aren't submitting speedtest results from their home fiber connection and claiming it's from a cafe?

**The solution: strict location-based verification.**

<p align="center">
  <img src="/cafe-speed-anti-tampering.webp" />
  <i>Location verification showing distance from cafe - submissions only allowed within 2km radius</i>
</p>

CafeSpeed enforces a **2-kilometer radius rule**. The site automatically detects your location and calculates your distance from the cafe. If you're outside the allowed radius, you can run the speedtest, but you won't be able to submit the result.

The anti-tampering system provides:
- **Real-time distance calculation** showing exactly how far you are from the cafe
- **Visual feedback** with a map displaying your location relative to the cafe
- **Clear warnings** if you're outside the submission zone
- **Transparency** about the 2km limit

This creates a trustworthy ecosystem where every measurement is guaranteed to be taken from the actual cafe location (or very nearby). No more fake reviews, no more inflated speeds, just real data from real people.

## Additional Trust Mechanisms

Location verification alone is powerful, but I implemented additional safeguards:

**Google OAuth Authentication**: Users must sign in with Google to submit measurements. This adds accountability and prevents spam while keeping the signup process frictionless.

**Community Moderation**: Each measurement can be upvoted, downvoted, or flagged by the community. Suspicious entries are marked with a warning flag, allowing the community to self-regulate.

**Transparent History**: All submissions show the submitter's name and timestamp, creating a paper trail that discourages manipulation.

## Map View for Discovery

<p align="center">
  <img src="/cafe-speed-map.webp" />
  <i>Interactive map view showing cafes and your current location</i>
</p>

Beyond submitting measurements, CafeSpeed helps you discover cafes with good internet. The platform offers two view modes:

- **List view**: Browse all cafes with their average speeds at a glance
- **Map view**: See cafes geographically, perfect for finding the nearest option with reliable WiFi

The map integrates with your device's location services to show you exactly where you are and which verified cafes are nearby.

## The Technical Stack

CafeSpeed is built with modern web technologies, deployed on Cloudflare Pages for global performance. The location verification relies on browser geolocation APIs combined with server-side distance calculations to ensure security.

The platform currently features 3 cafes in Yogyakarta, Indonesia - my testing ground and local community. But the architecture is designed to scale globally as more remote workers and digital nomads discover and contribute to the platform.

## Building Trust Through Verification

What makes CafeSpeed different from traditional review platforms is its unwavering focus on **verification over volume**. I'd rather have 10 verified, location-checked measurements than 100 unverified claims.

The 2km radius might seem strict, but it's the key to maintaining trust. Users can see the exact distance they are from a cafe before attempting to submit. This transparency builds confidence in the platform's data integrity.

## The Future of Work-Friendly Cafe Reviews

CafeSpeed represents a new approach to sharing location-based information - one where technical verification replaces blind trust. As the platform grows, I envision:

- Expanding to more cities worldwide
- Adding time-based analytics (peak hours vs. off-peak)
- Integrating with other work-friendly amenities (power outlets, noise levels)
- Building a community of remote workers who help each other find great workspaces

## Join the Community

If you're a remote worker, digital nomad, or anyone who regularly works from cafes, I invite you to try [CafeSpeed](https://cafe-speed.pages.dev). Submit measurements from your favorite cafes, discover new workspaces, and help build a trusted database of real internet speeds.

Because when you need reliable WiFi for that important video call, you deserve to know the truth - and the truth is always within 2 kilometers of where you're sitting.

---

*Have you tried CafeSpeed? Found a cafe with surprisingly fast WiFi? Submit your measurements and help the community make better decisions about where to work.*
