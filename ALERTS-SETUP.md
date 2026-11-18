# Order and sign-up alerts on your phone (Telegram)

Every new sign-up, new order and "I have paid" tap is sent to your Telegram as a text message.
The website keeps working without this, but you will not get alerts until it is set up.

1. In Telegram, open **@BotFather**, send `/newbot`, and follow the steps. Copy the **bot token** it gives you.
2. Open your new bot and send it any message (for example "hi").
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser (put your token in place of `<TOKEN>`).
   Find `"chat":{"id": 123456789 ...` and copy that number. This is your **chat id**.
   To alert several people, make a Telegram group, add the bot, send a message in the group and use the group's id (it starts with `-`).
4. Cloudflare dashboard > Workers & Pages > **alfatech-mobiles** > Settings > **Variables and Secrets** > Add:
   - `TELEGRAM_BOT_TOKEN` (type: Secret) = the bot token
   - `TELEGRAM_CHAT_ID` (type: Secret) = the chat id (several ids can be separated with commas)
5. Deploy again (or save and deploy). Open `https://alfatechmobiles.in/api/status` and check it shows `"alerts":true`.

Sign-up asks for a name and a mobile number only. The number is not verified by OTP, so a customer could type someone else's number. Confirm every order by calling the customer.
