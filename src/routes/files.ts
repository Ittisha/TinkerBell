import express, { Request, Response } from 'express';
import { google } from 'googleapis';
import tokenStorage from '../models/TokenStore';
import dotenv from 'dotenv'
import multer from 'multer';
import { Readable } from 'stream';

dotenv.config();

const router = express.Router();

async function getAuthenticatedClient(userId: string) {
	const tokenData = tokenStorage.get(userId);

	if (!tokenData) throw new Error('Unauthorized');

	const oauth2Client = new google.auth.OAuth2(
		process.env.GOOGLE_CLIENT_ID,
		process.env.GOOGLE_CLIENT_SECRET,
		process.env.GOOGLE_REDIRECT_URI
	);

	oauth2Client.setCredentials({
		access_token: tokenData.accessToken,
		refresh_token: tokenData.refreshToken,
	});

	return oauth2Client;
}

// List all files from Google Drive
router.get('/files', async (req: Request, res: Response): Promise<any> => {
	try {
		// @ts-ignore next-line
		const userId = req.session?.userId;

		if (!userId) return res.status(401).json({ error: 'Unauthorized' });

		const authClient = await getAuthenticatedClient(userId);
		const drive = google.drive({ version: 'v3', auth: authClient });

		const query = "mimeType = 'application/vnd.google-apps.folder' " +
			"or mimeType = 'application/pdf' " +
			"or mimeType = 'application/vnd.google-apps.document' " +
			"or mimeType = 'application/vnd.google-apps.spreadsheet' " +
			"or mimeType = 'application/vnd.google-apps.presentation'";

		const response = await drive.files.list({
			q: query,
			pageSize: 20,
			fields: 'files(id, name, size, modifiedTime, mimeType)',
		});

		res.json(response.data.files);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error fetching files.' });
	}
});

router.get('/files/:fileId', async (req: Request, res: Response): Promise<any> => {
	try {
		// @ts-ignore next-line
		const userId = req.session?.userId;
		if (!userId) return res.status(401).json({ error: 'Unauthorized' });

		const fileId = req.params.fileId;
		const authClient = await getAuthenticatedClient(userId);
		const drive = google.drive({ version: 'v3', auth: authClient });

		const fileMetadataResponse = await drive.files.get({
			fileId,
			fields: 'name,mimeType',
		});
		const { name, mimeType } = fileMetadataResponse.data;

		const response = await drive.files.get({
			fileId,
			alt: 'media',
		}, { responseType: 'stream' });

		res.set('Content-Disposition', `attachment; filename="${name}"`);
		res.set('Content-Type', mimeType || 'application/octet-stream');

		response.data.pipe(res);
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: 'Error fetching the file.' });
	}
});

router.get('/folder/:folderId', async (req: Request, res: Response): Promise<void> => {
	try {
		// @ts-ignore next-line
		const userId = req.session?.userId;

		if (!userId) {
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}

		const folderId = req.params.folderId;
		if (!folderId) {
			res.status(400).json({ error: 'Folder ID is required.' });
			return;
		}

		const authClient = await getAuthenticatedClient(userId);
		const drive = google.drive({ version: 'v3', auth: authClient });

		// Query to list all files and folders within the specified folder
		const response = await drive.files.list({
			q: `'${folderId}' in parents`,
			pageSize: 10,
			fields: 'files(id, name, mimeType, modifiedTime)',
		});

		res.json(response.data.files);
	} catch (error) {
		console.error('Error listing folder contents:', error);
		res.status(500).json({ error: 'Failed to retrieve folder contents.' });
	}
});

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // Limit file size to 10MB

router.post('/upload', upload.single('file'), async (req: any, res: Response): Promise<void> => {
	try {
		// @ts-ignore next-line
		const userId = req.session?.userId;

		if (!userId) {
			res.status(401).json({ error: 'Unauthorized' });
			return;
		}

		const authClient = await getAuthenticatedClient(userId);

		const { originalname, buffer, mimetype } = req.file;
		if (!originalname || !buffer || !mimetype) {
			res.status(400).json({ error: 'Invalid file data.' });
			return;
		}

		const media = {
			mimeType: mimetype,
			body: Readable.from(buffer), // Create a readable stream from the buffer
		};

		const drive = google.drive({ version: 'v3', auth: authClient });
		const response = await drive.files.create({
			requestBody: {
				name: originalname,
				mimeType: mimetype,
			},
			media,
		});

		res.json({ success: true, fileId: response.data.id, fileName: response.data.name });
	} catch (error) {
		console.error('Error uploading file:', error);
		res.status(500).json({ error: 'Failed to upload file.' });
	}
});

export default router;
