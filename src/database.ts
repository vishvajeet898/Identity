import { Pool, PoolClient } from 'pg';
import { Contact } from './types';

export class Database {
    private pool: Pool;

    constructor(connectionString: string) {
        this.pool = new Pool({
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
    }

    async getClient(): Promise<PoolClient> {
        return this.pool.connect();
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    // Create contacts table
    async createTable(): Promise<void> {
        const client = await this.getClient();
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS contacts (
          id SERIAL PRIMARY KEY,
          phone_number VARCHAR(20),
          email VARCHAR(255),
          linked_id INTEGER REFERENCES contacts(id),
          link_precedence VARCHAR(10) CHECK (link_precedence IN ('primary', 'secondary')) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
          deleted_at TIMESTAMP WITH TIME ZONE
        );
        
        CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
        CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
        CREATE INDEX IF NOT EXISTS idx_contacts_linked_id ON contacts(linked_id);
      `);
        } finally {
            client.release();
        }
    }

    // Find contacts by email or phone
    async findContactsByEmailOrPhone(email?: string, phoneNumber?: string): Promise<Contact[]> {
        const client = await this.getClient();
        try {
            let query = 'SELECT * FROM contacts WHERE deleted_at IS NULL AND (';
            const params: any[] = [];
            const conditions: string[] = [];

            if (email) {
                params.push(email);
                conditions.push(`email = $${params.length}`);
            }

            if (phoneNumber) {
                params.push(phoneNumber);
                conditions.push(`phone_number = $${params.length}`);
            }

            query += conditions.join(' OR ') + ') ORDER BY created_at ASC';

            const result = await client.query(query, params);
            return result.rows.map(this.mapRowToContact);
        } finally {
            client.release();
        }
    }

    // Get all contacts in a linked group
    async getLinkedContacts(primaryId: number): Promise<Contact[]> {
        const client = await this.getClient();
        try {
            const result = await client.query(`
        WITH RECURSIVE contact_tree AS (
          -- Base case: primary contact
          SELECT * FROM contacts 
          WHERE id = $1 AND deleted_at IS NULL
          
          UNION ALL
          
          -- Recursive case: secondary contacts
          SELECT c.* FROM contacts c
          INNER JOIN contact_tree ct ON c.linked_id = ct.id
          WHERE c.deleted_at IS NULL
        )
        SELECT * FROM contact_tree
        ORDER BY created_at ASC, id ASC
      `, [primaryId]);

            return result.rows.map(this.mapRowToContact);
        } finally {
            client.release();
        }
    }

    // Create a new contact
    async createContact(
        email: string | null,
        phoneNumber: string | null,
        linkedId: number | null = null,
        linkPrecedence: 'primary' | 'secondary' = 'primary'
    ): Promise<Contact> {
        const client = await this.getClient();
        try {
            const result = await client.query(`
        INSERT INTO contacts (email, phone_number, linked_id, link_precedence)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [email, phoneNumber, linkedId, linkPrecedence]);

            return this.mapRowToContact(result.rows[0]);
        } finally {
            client.release();
        }
    }

    // Update contact to secondary
    async updateContactToSecondary(contactId: number, linkedId: number): Promise<void> {
        const client = await this.getClient();
        try {
            await client.query(`
        UPDATE contacts 
        SET linked_id = $1, link_precedence = 'secondary', updated_at = NOW()
        WHERE id = $2
      `, [linkedId, contactId]);
        } finally {
            client.release();
        }
    }

    // Update all contacts linked to a contact to point to new primary
    async updateLinkedContactsPrimary(oldPrimaryId: number, newPrimaryId: number): Promise<void> {
        const client = await this.getClient();
        try {
            await client.query(`
        UPDATE contacts 
        SET linked_id = $1, updated_at = NOW()
        WHERE linked_id = $2
      `, [newPrimaryId, oldPrimaryId]);
        } finally {
            client.release();
        }
    }

    private mapRowToContact(row: any): Contact {
        return {
            id: row.id,
            phoneNumber: row.phone_number,
            email: row.email,
            linkedId: row.linked_id,
            linkPrecedence: row.link_precedence,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at,
        };
    }
}