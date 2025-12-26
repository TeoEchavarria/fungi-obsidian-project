const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "fungiDataBase";

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    const client = await MongoClient.connect(uri);
    const db = client.db(dbName);

    cachedClient = client;
    cachedDb = db;
    return { client, db };
}

/**
 * Extract user from session (stored in localStorage on client)
 * Since we don't have JWT, we'll accept email from Authorization header
 * and verify it exists in our users collection.
 * 
 * SECURITY NOTE: This is a simplified auth check. In production,
 * you should use proper JWT tokens or session cookies.
 */
async function authenticateUser(req, db) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    // Extract email from bearer token (client sends email as token)
    const email = authHeader.replace('Bearer ', '');

    // Verify user exists and is approved
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ email });

    if (!user || !user.is_approved) {
        return null;
    }

    return user;
}

module.exports = async (req, res) => {
    const { db } = await connectToDatabase();
    const collection = db.collection('comments');

    try {
        // GET: Fetch comments for a record
        if (req.method === 'GET') {
            const { record_guid } = req.query;

            if (!record_guid) {
                return res.status(400).json({ message: 'record_guid is required' });
            }

            const comments = await collection
                .find({ record_guid })
                .sort({ created_at: 1 }) // Oldest first
                .toArray();

            return res.status(200).json({ comments });
        }

        // POST: Create a new comment
        if (req.method === 'POST') {
            // Authenticate user
            const user = await authenticateUser(req, db);
            if (!user) {
                return res.status(401).json({ message: 'Unauthorized. Please log in.' });
            }

            const { record_guid, content } = req.body;

            // Validate input
            if (!record_guid || typeof record_guid !== 'string') {
                return res.status(400).json({ message: 'Invalid record_guid' });
            }

            if (!content || typeof content !== 'string') {
                return res.status(400).json({ message: 'Comment content is required' });
            }

            const trimmedContent = content.trim();
            if (trimmedContent.length === 0) {
                return res.status(400).json({ message: 'Comment cannot be empty' });
            }

            if (trimmedContent.length > 1000) {
                return res.status(400).json({ message: 'Comment cannot exceed 1000 characters' });
            }

            // Create comment document
            // CRITICAL: We use the authenticated user's data, NOT client-submitted data
            const newComment = {
                record_guid,
                author_id: user._id.toString(),
                author_email: user.email,
                content: trimmedContent,
                created_at: new Date()
            };

            const result = await collection.insertOne(newComment);

            // Return the created comment
            return res.status(201).json({
                message: 'Comment created',
                comment: {
                    _id: result.insertedId.toString(),
                    ...newComment
                }
            });
        }

        // Method not allowed
        return res.status(405).json({ message: 'Method not allowed' });

    } catch (error) {
        console.error('Comments API error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
