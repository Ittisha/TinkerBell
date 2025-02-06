import express, { Application } from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import filesRoutes from './routes/files';
import cors from 'cors';
//import { google, drive_v3 } from 'googleapis';

dotenv.config();

const PORT = 3000;

// Initialize Express app
const app: Application = express();

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
	console.error('SESSION_SECRET is not defined in .env');
	process.exit(1);
}

app.use(
	session({
		secret: sessionSecret,
		resave: false,
		saveUninitialized: false,
		cookie: {
			httpOnly: true,
			secure: false, // Use true in production
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
		},
	})
);

app.use(express.json());

app.use(
	cors({
		origin: ['http://localhost:4200'],
		credentials: true,
	})
);

app.use('/api', authRoutes);
app.use('/api', filesRoutes);

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

export default app;
