import { Database } from './database';
import { Contact, IdentifyRequest, ConsolidatedContact } from './types';

export class ContactService {
    constructor(private db: Database) {}

    async identify(request: IdentifyRequest): Promise<ConsolidatedContact> {
        const { email, phoneNumber } = request;

        // Find existing contacts with matching email or phone
        const existingContacts = await this.db.findContactsByEmailOrPhone(email, phoneNumber);

        if (existingContacts.length === 0) {
            // No existing contacts, create new primary contact
            const newContact = await this.db.createContact(email || null, phoneNumber || null);
            return this.buildConsolidatedContact([newContact]);
        }

        // Find all primary contacts from existing matches
        const primaryContacts = existingContacts.filter(c => c.linkPrecedence === 'primary');
        const secondaryContacts = existingContacts.filter(c => c.linkPrecedence === 'secondary');

        // Get all primary contacts (including those linked through secondary contacts)
        const allPrimaryIds = new Set<number>();

        for (const contact of primaryContacts) {
            allPrimaryIds.add(contact.id);
        }

        for (const contact of secondaryContacts) {
            if (contact.linkedId) {
                allPrimaryIds.add(contact.linkedId);
            }
        }

        const uniquePrimaryIds = Array.from(allPrimaryIds);

        if (uniquePrimaryIds.length === 1) {
            // Single primary contact found, check if we need to create a secondary
            const primaryId = uniquePrimaryIds[0];
            const allLinkedContacts = await this.db.getLinkedContacts(primaryId);

            // Check if this request introduces new information
            const existingEmails = new Set(allLinkedContacts.map(c => c.email).filter(Boolean));
            const existingPhones = new Set(allLinkedContacts.map(c => c.phoneNumber).filter(Boolean));

            const hasNewEmail = email && !existingEmails.has(email);
            const hasNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

            if (hasNewEmail || hasNewPhone) {
                // Create new secondary contact
                const newSecondary = await this.db.createContact(
                    email || null,
                    phoneNumber || null,
                    primaryId,
                    'secondary'
                );
                allLinkedContacts.push(newSecondary);
            }

            return this.buildConsolidatedContact(allLinkedContacts);
        }

        if (uniquePrimaryIds.length > 1) {
            // Multiple primary contacts need to be linked
            // Find the oldest primary (by creation date)
            const primaryContactsDetails = await Promise.all(
                uniquePrimaryIds.map(id => this.db.getLinkedContacts(id))
            );

            // Flatten and find the oldest primary
            const allPrimaries = primaryContactsDetails
                .map(group => group.find(c => c.linkPrecedence === 'primary')!)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            const oldestPrimary = allPrimaries[0];
            const otherPrimaries = allPrimaries.slice(1);

            // Convert other primaries to secondary and update their linked contacts
            for (const primary of otherPrimaries) {
                await this.db.updateContactToSecondary(primary.id, oldestPrimary.id);
                await this.db.updateLinkedContactsPrimary(primary.id, oldestPrimary.id);
            }

            // Get all contacts now linked to the oldest primary
            const allLinkedContacts = await this.db.getLinkedContacts(oldestPrimary.id);

            // Check if we need to create a new secondary contact for new information
            const existingEmails = new Set(allLinkedContacts.map(c => c.email).filter(Boolean));
            const existingPhones = new Set(allLinkedContacts.map(c => c.phoneNumber).filter(Boolean));

            const hasNewEmail = email && !existingEmails.has(email);
            const hasNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

            if (hasNewEmail || hasNewPhone) {
                const newSecondary = await this.db.createContact(
                    email || null,
                    phoneNumber || null,
                    oldestPrimary.id,
                    'secondary'
                );
                allLinkedContacts.push(newSecondary);
            }

            return this.buildConsolidatedContact(allLinkedContacts);
        }

        // This shouldn't happen, but fallback
        throw new Error('Unexpected state in contact identification');
    }

    private buildConsolidatedContact(contacts: Contact[]): ConsolidatedContact {
        // Sort contacts: primary first, then by creation date
        const sortedContacts = contacts.sort((a, b) => {
            if (a.linkPrecedence === 'primary' && b.linkPrecedence === 'secondary') return -1;
            if (a.linkPrecedence === 'secondary' && b.linkPrecedence === 'primary') return 1;
            return a.createdAt.getTime() - b.createdAt.getTime();
        });

        const primaryContact = sortedContacts.find(c => c.linkPrecedence === 'primary')!;
        const secondaryContacts = sortedContacts.filter(c => c.linkPrecedence === 'secondary');

        // Collect unique emails and phones, with primary contact's values first
        const emails: string[] = [];
        const phoneNumbers: string[] = [];

        // Add primary contact's email and phone first
        if (primaryContact.email) emails.push(primaryContact.email);
        if (primaryContact.phoneNumber) phoneNumbers.push(primaryContact.phoneNumber);

        // Add unique values from secondary contacts
        for (const contact of secondaryContacts) {
            if (contact.email && !emails.includes(contact.email)) {
                emails.push(contact.email);
            }
            if (contact.phoneNumber && !phoneNumbers.includes(contact.phoneNumber)) {
                phoneNumbers.push(contact.phoneNumber);
            }
        }

        return {
            primaryContatctId: primaryContact.id, // Note: keeping the typo from requirements
            emails,
            phoneNumbers,
            secondaryContactIds: secondaryContacts.map(c => c.id),
        };
    }
}