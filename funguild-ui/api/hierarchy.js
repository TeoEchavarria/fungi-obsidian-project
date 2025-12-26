const { MongoClient } = require('mongodb');

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

module.exports = async (req, res) => {
    const { db } = await connectToDatabase();
    const collection = db.collection('hierarchy_overrides');

    if (req.method === 'GET') {
        try {
            const overrides = await collection.find({}).toArray();
            return res.status(200).json({ overrides });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }

    if (req.method === 'POST') {
        // Simple auth check: user must provide their email in Authorization header
        // and they must have can_edit permission in the 'users' collection.
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const email = authHeader.split(' ')[1];
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email });

        if (!user || !user.can_edit) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        }

        const { record_guid, parent_guid } = req.body;

        if (!record_guid) {
            return res.status(400).json({ message: 'Missing record_guid' });
        }

        try {
            // Upsert the override
            await collection.updateOne(
                { record_guid },
                { $set: { parent_guid, updated_at: new Date(), updated_by: email } },
                { upsert: true }
            );

            return res.status(200).json({ message: 'Override saved successfully' });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
};
