import express, { Request, Response } from 'express';
import { google } from 'googleapis';
import tokenStorage from '../models/TokenStore';
import dotenv from 'dotenv'

dotenv.config();

const router = express.Router();

const getOAuth2Client = () => {
	return new google.auth.OAuth2(
		process.env.GOOGLE_CLIENT_ID,
		process.env.GOOGLE_CLIENT_SECRET,
		process.env.GOOGLE_REDIRECT_URI
	);
};

const SCOPES = [
	process.env.GOOGLE_DRIVE_SCOPE || '',
	process.env.GOOGLE_OPEN_ID_SCOPE || '',
	process.env.GOOGLE_EMAIL_SCOPE || ''
];

router.get('/auth', async (_req: Request, res: Response)=> {
	try {
		const oauth2Client = getOAuth2Client();
		const authUrl = oauth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: SCOPES,
		});
		res.json({ authUrl });
	} catch (error) {
		console.error('Error generating auth URL:', error);
		res.status(500).json({ error: 'Failed to generate authentication URL.' });
	}
});

router.get('/auth/callback', async (req: Request, res: Response): Promise<any> => {
	try {
		const { code } = req.query;

		if (!code) {
			return res.status(400).json({ error: 'Authorization code is required.' });
		}

		const oauth2Client = getOAuth2Client();
		const { tokens, res: response } = await oauth2Client.getToken(code as string);

		if (!tokens.access_token) {
			return res.status(400).json({ error: 'Failed to retrieve access token.' });
		}

		const userId = tokens.id_token!;
		tokenStorage.set(userId, {
			accessToken: tokens.access_token!,
			refreshToken: tokens.refresh_token || '',
		});

		// @ts-ignore next-line
		req.session.userId = userId;

		res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ success: true, userId: "${userId}" }, "*");
        }
        window.close();
      </script>
    `);
	} catch (error) {
		console.error('Error exchanging code for tokens:', error);
		res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ success: false, error: "Authentication failed." }, "*");
        }
        window.close();
      </script>
    `);
	}
});

router.post('/auth/sync-session', (req: Request, res: Response) => {
	const { userId } = req.body;

	if (!userId) {
		res.status(400).json({ error: 'User ID is required.' });
		return
	}
	// @ts-ignore next-line
	req.session.userId = userId;

	res.json({ success: true, message: 'Session synchronized.' });
});

export default router;
