# Order and sign-up alerts on your phone

Every new sign-up, new order and "I have paid" tap is sent to you as a text message.
The website keeps working without this, but you will not get alerts until you set up **one** of the two options below (you can set up both).

## Option A: WhatsApp (free, about 5 minutes)

Uses the free CallMeBot service. It is made for personal use and is not an official WhatsApp product, so keep Telegram (option B) as a backup.

1. Save the number **+34 611 01 16 37** in your phone contacts (name it CallMeBot).
2. From the WhatsApp number that should get the alerts, send this exact message to that contact: `I allow callmebot to send me messages`
3. Within a couple of minutes it replies with "API Activated ... Your APIKEY is 123456". If nothing comes, try again after 24 hours.
4. Cloudflare dashboard > Workers & Pages > **alfatech-mobiles** > Settings > **Variables and Secrets** > Add (type Secret):
   - `CALLMEBOT_PHONE` = your number with country code, for example `+919554484848`
   - `CALLMEBOT_APIKEY` = the key from step 3
   To alert more than one person, each person repeats steps 1 to 3, then list the numbers and the keys in the same order, separated by commas.
5. Deploy again. Open `https://alfatechmobiles.in/api/status` and check it shows `"whatsapp":true`.

## Option B: Telegram (free, official, most reliable)

1. In Telegram, open **@BotFather**, send `/newbot`, follow the steps and copy the **bot token**.
2. Open your new bot and send it any message (for example "hi").
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser (put your token in place of `<TOKEN>`) and copy the number after `"chat":{"id":`.
4. In the same Cloudflare place add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (Secrets).
5. Deploy again and check `/api/status` shows `"telegram":true`.

## Notes
- Sign-up asks for a name and mobile number only. The number is not verified by OTP, so a customer could type someone else's number. Confirm every order by calling the customer.
- The official WhatsApp Business Cloud API (Meta) also works but needs a Meta business account, a separate number and approved message templates. Ask if you want it later.
