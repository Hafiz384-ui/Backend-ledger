import express from 'express'
import cookieParser from 'cookie-parser';
import cors from 'cors';

const app = express();

// Trust reverse proxies to extract real client IP in req.ip and x-forwarded-for
app.set('trust proxy', true);

const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Blocked by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Set-Cookie']
}));

app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))

/**
 * Routes require from here
 */

import authRouter from './routes/auth.routes.js'
import accountRouter from './routes/account.routes.js'
import transactionRouter from './routes/transaction.routes.js'
import auditLogRouter from './routes/auditLog.routes.js'

/**
 *  Start using Routes from here
 */
app.use('/api/auth', authRouter)
app.use('/api/accounts', accountRouter)
app.use('/api/transactions', transactionRouter)
app.use('/api/audit-logs', auditLogRouter)

app.get("/test", (req, res) => {
    return res.json({ message: "Hello World" });
})

export default app;