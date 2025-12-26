const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

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
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { action, email, password, justification } = req.body;
    const { db } = await connectToDatabase();
    const collection = db.collection('users');

    try {
        if (action === 'register') {
            const existingUser = await collection.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const newUser = {
                email,
                password_hash: passwordHash,
                can_edit: false,
                is_approved: false,
                justification,
                created_at: new Date()
            };

            await collection.insertOne(newUser);
            return res.status(201).json({ message: 'User registered successfully' });
        }

        if (action === 'login') {
            const user = await collection.findOne({ email });
            if (!user) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const isValid = await bcrypt.compare(password, user.password_hash);
            if (!isValid) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            // In a real app, we'd use JWT. For this simple frontend, we return the profile.
            // The frontend will store the email/state in memory.
            const { password_hash, ...profile } = user;
            return res.status(200).json({ profile });
        }

        return res.status(400).json({ message: 'Invalid action' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};
