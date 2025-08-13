# Bitespeed Identity Reconciliation

Customer identity reconciliation service that links contacts sharing email or phone number.

## Installation

```bash
npm install
```

## Setup

1. Create `.env` file:
```
DATABASE_URL=postgresql://user:pass@host:port/database
PORT=3000
```

2. Run database migration:
```bash
npm run migrate
```

## Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API

### POST /identify
Links customer contacts by email or phone.

**Request:**
```json
{
  "email": "user@example.com",
  "phoneNumber": "123456"
}
```

**Response:**
```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["user@example.com"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```
