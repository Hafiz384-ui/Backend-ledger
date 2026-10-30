import 'dotenv/config';
import app from './src/app.js';
import connectionDB from './src/config/db.js';

// Connect to MongoDB
connectionDB();

// When running locally with `node server.js` or `npm start`
if (process.env.NODE_ENV !== 'production' || process.env.RUN_LOCAL === 'true') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// Export Express app for Vercel Serverless Function
export default app;
