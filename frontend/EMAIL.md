# Email API Documentation

## Send Email Endpoint

Send an email using the Node-RED email service.

### Endpoint

```
POST https://qa190.zpaper.com/r/send-email
```

### Request

#### Headers

```
Content-Type: application/json
```

#### Body Parameters

| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| email     | string | Yes      | Recipient email address        |
| subject   | string | Yes      | Email subject line             |
| body      | string | Yes      | Email body content (plain text)|

#### Example Request

```bash
curl -X POST https://qa190.zpaper.com/r/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "recipient@example.com",
    "subject": "Test Email",
    "body": "This is a test email sent via the API"
  }'
```

### Response

#### Success Response

**Status Code:** 200 OK

```json
{
  "success": true,
  "message": "Email sent successfully"
}
```

#### Error Responses

**Status Code:** 400 Bad Request

Missing required fields:

```json
{
  "error": "Missing required fields: email, subject, and body are required"
}
```

**Status Code:** 500 Internal Server Error

Email sending failed:

```json
{
  "success": false,
  "message": "Failed to send email",
  "error": "Error details here"
}
```

### Examples

#### JavaScript (Fetch API)

```javascript
const sendEmail = async () => {
  const response = await fetch('https://qa190.zpaper.com/r/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'user@example.com',
      subject: 'Hello from API',
      body: 'This email was sent using the email API'
    })
  });

  const result = await response.json();
  console.log(result);
};
```

#### Python

```python
import requests

url = "https://qa190.zpaper.com/r/send-email"
payload = {
    "email": "user@example.com",
    "subject": "Hello from API",
    "body": "This email was sent using the email API"
}

response = requests.post(url, json=payload)
print(response.json())
```

#### Node.js (Axios)

```javascript
const axios = require('axios');

axios.post('https://qa190.zpaper.com/r/send-email', {
    email: 'user@example.com',
    subject: 'Hello from API',
    body: 'This email was sent using the email API'
})
.then(response => {
    console.log(response.data);
})
.catch(error => {
    console.error('Error:', error.response.data);
});
```

### Notes

- The email service uses the `nail` command on the server
- Only plain text emails are supported
- Ensure the recipient email address is valid
- The API does not support attachments
- Rate limiting may apply depending on server configuration

### Troubleshooting

1. **400 Bad Request**: Ensure all required fields (email, subject, body) are included in the request
2. **500 Internal Server Error**: The email command failed - check server logs for details
3. **Connection refused**: Verify the Node-RED service is running and accessible at the specified URL
