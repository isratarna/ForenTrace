import db from '../config/db.js';

export async function findAllFamilyMembers({ person_id, search } = {}) {
    let query = `
    SELECT 
      fm.*,
      mp.first_name AS missing_person_first_name,
      mp.last_name AS missing_person_last_name,
      mp.status AS missing_person_status
    FROM family_members fm
    JOIN missing_persons mp ON fm.person_id = mp.person_id
  `;
    const params = [];
    const conditions = [];

    if (person_id) {
        conditions.push('fm.person_id = ?');
        params.push(person_id);
    }

    if (search) {
        conditions.push(
            '(fm.first_name LIKE ? OR fm.last_name LIKE ? OR fm.relationship LIKE ? OR fm.phone LIKE ?)'
        );
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY fm.created_at DESC';

    const [rows] = await db.query(query, params);
    return rows;
}

export async function findFamilyMembersByPersonId(personId) {
    const [rows] = await db.query(
        `SELECT 
      fm.*,
      mp.first_name AS missing_person_first_name,
      mp.last_name AS missing_person_last_name,
      mp.status AS missing_person_status
     FROM family_members fm
     JOIN missing_persons mp ON fm.person_id = mp.person_id
     WHERE fm.person_id = ?
     ORDER BY fm.created_at DESC`,
        [personId]
    );
    return rows;
}

export async function findFamilyMemberById(id) {
    const [rows] = await db.query(
        `SELECT 
      fm.*,
      mp.first_name AS missing_person_first_name,
      mp.last_name AS missing_person_last_name,
      mp.status AS missing_person_status
     FROM family_members fm
     JOIN missing_persons mp ON fm.person_id = mp.person_id
     WHERE fm.family_id = ?`,
        [id]
    );
    return rows[0] || null;
}

export async function createFamilyMember(data) {
    const {
        person_id,
        first_name,
        last_name,
        relationship,
        gender = null,
        phone,
        email = null,
        national_id = null,
        blood_group = null,
        address = null,
        remarks = null,
    } = data;

    const [result] = await db.query(
        `INSERT INTO family_members (
      person_id, first_name, last_name, relationship, gender,
      phone, email, national_id, blood_group, address, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            person_id,
            first_name,
            last_name,
            relationship,
            gender,
            phone,
            email,
            national_id,
            blood_group,
            address,
            remarks,
        ]
    );

    return findFamilyMemberById(result.insertId);
}

export async function updateFamilyMemberById(id, data) {
    const {
        person_id,
        first_name,
        last_name,
        relationship,
        gender = null,
        phone,
        email = null,
        national_id = null,
        blood_group = null,
        address = null,
        remarks = null,
    } = data;

    await db.query(
        `UPDATE family_members
     SET person_id = COALESCE(?, person_id),
         first_name = ?,
         last_name = ?,
         relationship = ?,
         gender = ?,
         phone = ?,
         email = ?,
         national_id = ?,
         blood_group = ?,
         address = ?,
         remarks = ?
     WHERE family_id = ?`,
        [
            person_id ?? null,
            first_name,
            last_name,
            relationship,
            gender,
            phone,
            email,
            national_id,
            blood_group,
            address,
            remarks,
            id,
        ]
    );

    return findFamilyMemberById(id);
}

export async function deleteFamilyMemberById(id) {
    const [result] = await db.query('DELETE FROM family_members WHERE family_id = ?', [id]);
    return result.affectedRows;
}

export async function createFamilyDnaSample(familyId, sampleData) {
    const member = await findFamilyMemberById(familyId);
    if (!member) return null;

    const {
        lab_id = null,
        technician_id = null,
        sample_type = 'Buccal Swab (Family Reference)',
        collection_date = new Date().toISOString().split('T')[0],
        storage_location = null,
        remarks = `Reference DNA sample from family member (${member.first_name} ${member.last_name})`,
        status = 'Collected',
    } = sampleData;

    const [result] = await db.query(
        `INSERT INTO dna_samples (
      person_id, family_id, lab_id, technician_id,
      sample_type, collection_date, storage_location, remarks, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            member.person_id,
            familyId,
            lab_id,
            technician_id,
            sample_type,
            collection_date,
            storage_location,
            remarks,
            status,
        ]
    );

    return {
        sample_id: result.insertId,
        person_id: member.person_id,
        family_id: Number(familyId),
        sample_type,
        collection_date,
        storage_location,
        remarks,
        status,
    };
}