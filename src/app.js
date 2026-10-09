import express from 'express'
import cookieParser from 'cookie-parser';
const app = express();

app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))

/**
 * Routes require from here
 */

import authRouter from './routes/auth.routes.js'
import accountRouter from './routes/account.routes.js'
import transactionRouter from './routes/transaction.routes.js'

/**
 *  Start using Routes from here
 */
app.use('/api/auth', authRouter)
app.use('/api/accounts', accountRouter)
app.use('/api/transactions', transactionRouter)

app.get("/test", (req, res) => {
    return res.json({ message: "Hello World" });
})

export default app;