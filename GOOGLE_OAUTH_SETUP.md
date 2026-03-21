# Google OAuth Setup Guide

To fix the **Access blocked: This app’s request is invalid** error, follow these steps to register your local redirect URI in the Google Cloud Console.

## Step-by-Step Fix

1.  **Open Google Cloud Console**  
    Go to the [Credentials page](https://console.cloud.google.com/apis/credentials).

2.  **Select Your Project**  
    Ensure you have selected the project associated with your Client ID (`...iigdosp.apps.googleusercontent.com`).

3.  **Edit OAuth 2.0 Client ID**  
    Find the **OAuth 2.0 Client IDs** list. Click the **name** of the client (usually "Web client 1").

4.  **Add Authorized Redirect URI**  
    Scroll down to the **Authorized redirect URIs** section.

    Click **ADD URI** and paste these addresses:
    
    **For Production (Render):**
    ```text
    https://ui-finance-latest.onrender.com/api/auth/google/callback
    ```

    **For Development (Local):**
    ```text
    http://localhost:5000/api/auth/google/callback
    ```

    > [!NOTE]
    > If you also access the app via `127.0.0.1:5000`, add that URI as well:
    > `http://127.0.0.1:5000/api/auth/google/callback`

5.  **Save Changes**  
    Click **SAVE** at the bottom of the page.

6.  **Test Again**  
    Wait about **1–2 minutes** for Google to update its settings, then refresh your login page and try clicking "Sign in with Google."

---

## Technical Details (For Reference)
- **Client ID**: `640905132414-mkmm4l4tvl6tnuj4a599cr5j3iigdosp.apps.googleusercontent.com`
- **Error**: `400: redirect_uri_mismatch`
- **Redirect URI Sent**: `http://localhost:5000/api/auth/google/callback`
