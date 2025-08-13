import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Database } from './database';
import { ContactService } from './contactService';
import { IdentifyRequest, IdentifyResponse } from './types';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Database and service setup
const db = new Database(process.env.DATABASE_URL!);
const contactService = new ContactService(db);

// Validation middleware
const validateIdentifyRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
        return res.status(400).json({
            error: 'At least one of email or phoneNumber must be provided'
        });
    }

    if (email && typeof email !== 'string') {
        return res.status(400).json({
            error: 'Email must be a string'
        });
    }

    if (phoneNumber && typeof phoneNumber !== 'string') {
        return res.status(400).json({
            error: 'Phone number must be a string'
        });
    }

    next();
};

// Routes
app.post('/identify', validateIdentifyRequest, async (req: express.Request, res: express.Response) => {
    try {
        const request: IdentifyRequest = req.body;
        const consolidatedContact = await contactService.identify(request);

        const response: IdentifyResponse = {
            contact: consolidatedContact
        };

        res.json(response);
    } catch (error) {
        console.error('Error in /identify:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// Health check endpoint
app.get('/health', (req: express.Request, res: express.Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req: express.Request, res: express.Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(port, () => {
    console.log(`Bitespeed Identity Reconciliation service running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await db.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await db.close();
    process.exit(0);
});