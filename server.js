import 'dotenv/config';           // ← MUST be first: loads .env before any other module initializes
import app from './src/app.js';
import connectionDB from './src/config/db.js';

const PORT = process.env.PORT || 3000;

// Connect to database
connectionDB();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})