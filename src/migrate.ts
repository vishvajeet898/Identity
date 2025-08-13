import dotenv from 'dotenv';
import { Database } from './database';

dotenv.config();

async function migrate() {
    const db = new Database(process.env.DATABASE_URL!);

    try {
        console.log('Creating tables...');
        await db.createTable();
        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

if (require.main === module) {
    migrate();
}
