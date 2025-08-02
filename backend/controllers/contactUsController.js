import pool from '../config/db.js';



export const contactFrom = async (req, res) => {
    try {
        const {subject, email, contactNumber,  description} = req.body;
        if (!subject || !email || !contactNumber || !description) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [result] = await pool.query(`INSERT INTO tbl_contact_form (subject, email, contactNumber, description) VALUES (?, ?, ?, ?)`, 
            [subject, email, contactNumber, description]);


            const id = result.insertId;
        const [contact] = await pool.query(`SELECT * FROM tbl_contact_form WHERE id = ?`, [id]);

        res.status(201).json({...contact[0]});
    } catch (error) {
        console.error("Error in contactFrom:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}



export const getContactUs = async (req, res) => {
    try {
        const [result] = await pool.query(`SELECT * FROM tbl_contact_form and status = 'Y' `);
        res.status(200).json(result);


    } catch (error) {
        console.error("Error in getContactUs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}





export const updateContactUs = async (req, res) => {
    try {
        const id = req.params.id;
        const { subject, email, contactNumber, description, status } = req.body;
        if (!subject || !email || !contactNumber || !description || !status) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const [result] = await pool.query(`UPDATE tbl_contact_form SET subject = ?, email = ?, contactNumber = ?, description = ?, status = ? WHERE id = ?`, 
            [subject, email, contactNumber, description, status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Contact not found" });
        }

        const [contact] = await pool.query(`SELECT * FROM tbl_contact_form WHERE id = ?`, [id]);
        res.status(200).json(...contact[0]);
    } catch (error) {
        console.error("Error in updateContactUs:", error);
        res.status(500).json({ message: "Internal server error" });
        
    }
}




export const deleteContactUs = async (req, res) => {
    try {
        const id = req.params.id;
        const [result] = await pool.query(`update tbl_contact_form set status = 'N' WHERE id = ?`, [id]);

        const [contact] = await pool.query(`SELECT * FROM tbl_contact_form WHERE id = ?`, [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Contact not found" });
        }

        res.status(200).json({ message: "Contact deleted successfully", ...contact[0] });
    } catch (error) {
        console.error("Error in deleteContactUs:", error);
        res.status(500).json({ message: "Internal server error" });
        
    }
}