# 📹 Vimeo API Integration Plan (Ad-Free Experience)

## 📋 Overview
This plan outlines the architecture for a comprehensive system that allows users to upload videos directly from the application to Vimeo servers, and subsequently stream them via a custom player. This ensures a professional, secure, and entirely ad-free user experience. The infrastructure is specifically designed to prevent server bandwidth (egress) consumption by utilizing direct client-to-Vimeo uploads.

---

## 🛠️ Tech Stack
* **Frontend:** Next.js / React
* **Backend:** Node.js / Next.js API Routes
* **Database:** Supabase (for storing video metadata and user relations)
* **Video Host:** Vimeo API
* **Upload Protocol:** Tus (to guarantee resumable uploads during network interruptions)

---

## 📅 Implementation Plan

### Phase 1: Vimeo Environment Setup (Prerequisites)
1. Create a Vimeo account and subscribe to the **Starter** plan or higher.
2. Navigate to the Vimeo Developer Portal and create a new application.
3. Extract the required credentials: `Client ID`, `Client Secret`, and generate a `Personal Access Token` with specific scopes (**Upload, Edit, Video**).
4. Enable **Domain-level Privacy** to whitelist your application's production domain exclusively.

### Phase 2: Backend Development
*The primary objective here is to secure your API keys; they must never be exposed to the client side.*
1. Create a secure API endpoint on your server (e.g., `/api/vimeo/get-upload-ticket`).
2. The server authenticates with the Vimeo API to request an authorized "Upload Ticket".
3. The server securely returns the generated Upload URL to the frontend.

### Phase 3: Frontend Development
*Direct browser-to-Vimeo upload to bypass your server infrastructure.*
1. Build a user interface (UI) to handle video file selection.
2. Fetch the secure upload ticket by calling the `/api/vimeo/get-upload-ticket` endpoint.
3. Utilize the `tus-js-client` library to execute the video upload directly from the user's local device to Vimeo's servers using the provided secure URL.
4. Implement a dynamic progress bar in the UI to reflect real-time upload status.

### Phase 4: Database Storage & Playback
1. Upon successful upload completion, transmit the returned `Vimeo Video ID` to your backend to save it within your **Supabase** database, linking it to the respective user's record.
2. For playback, integrate the `@vimeo/player` library within React to programmatically embed the video. This allows you to customize the player's UI colors and strictly hide all Vimeo logos, titles, and external links.

---

## 🚀 Deployment Strategy

### 1. Environment Variables
Ensure the following variables are securely injected into your production environment:
```env
VIMEO_CLIENT_ID=your_client_id
VIMEO_CLIENT_SECRET=your_client_secret
VIMEO_ACCESS_TOKEN=your_access_token
NEXT_PUBLIC_APP_DOMAIN=https://your-production-domain.com
```

### 2. Application Deployment
* **Hosting (e.g., Vercel, Google Cloud Run):** Deploy your Next.js application (including the API Routes) on a platform that supports auto-scaling.
* **CORS Configuration:** Verify that your server's Cross-Origin Resource Sharing (CORS) policies strictly permit requests only from your verified app domain.

### 3. Pre-Launch Checklist
- [ ] Verify that the default privacy status for all newly uploaded videos is automatically set to "Hide from Vimeo".
- [ ] Attempt to embed the video iframe on an external, unauthorized domain to validate that Domain-level Privacy successfully blocks playback.
- [ ] Conduct upload tests using various file sizes and simulate network disconnections to confirm the Tus protocol successfully resumes interrupted uploads.
