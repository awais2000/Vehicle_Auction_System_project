import express from "express"; 
import pool from "../config/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import   { resolve }  from 'path';
import path from 'path';
import * as fs from 'fs';
import * as fsAsync from 'fs/promises'; 
import { uploadPhoto, getPhotoUrl, deleteFileFromCloudinary } from '../utils/cloudinary.js'; 




export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Fetch user by email
        const [users] = await pool.query("SELECT * FROM tbl_users WHERE email = ?", [email]);

        //  2. Check if user exists
        if (users.length === 0) {
            return res.status(400).json({ 
                status: 400, 
                message: "Invalid email or password" 
            });
        }

        let user = users[0];

        
        // 2. Check if user exists
        if (users.length === 0) {
            return res.status(400).json({ 
                status: 400, 
                message: "Invalid email or password" 
            });
        }

         user = users[0];

        // 3. Check account status
        if (user.status === 'N') {
            return res.status(403).json({ 
                status: 403, 
                message: "Account deactivated. Contact support." 
            });
        }

        // 4. Password verification
        let storedPassword = user.password;
        const isHashed = storedPassword.startsWith("$2b$");

        // Auto-upgrade plain text passwords
        if (!isHashed) {
            console.log("Upgrading password security...");
            const hashedPassword = await bcrypt.hash(storedPassword, 10);
            await pool.query(
                "UPDATE tbl_users SET password = ? WHERE email = ?", 
                [hashedPassword, email]
            );
            storedPassword = hashedPassword;
        }

        // 5. Compare passwords
        const isMatch = await bcrypt.compare(password, storedPassword);
        if (!isMatch) {
            return res.status(400).json({ 
                status: 400, 
                message: "Invalid email or password" 
            });
        }

        // 6. Generate JWT token
        const token = jwt.sign(
            { 
                id: user.id,
                email: user.email, 
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
                token: token,
                id: user.id,
                name: user.name,
                email: user.email,
                contact: user.contact,
                cnic: user.cnic,
                address: user.address,
                postcode: user.postcode,
                image: user.image,
                role: user.role,
                date: user.date,
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ 
            status: 500, 
            message: "Internal server error" 
        });
    }
};



export const getUsersById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    console.log("Fetching user with ID:", id);

    // Default pagination
    const defaultLimit = 10;
    const defaultPage = 1;
    const entry = parseInt(req.query.entry) || defaultLimit;
    const page = parseInt(req.query.page) || defaultPage;
    const limit = Math.max(1, entry);
    const offset = (Math.max(1, page) - 1) * limit;

    // Fetch user from DB
    const [rows] = await pool.query(
      `SELECT id, name, contact, cnic, address, postcode,
       email, password, date, role, image
       FROM tbl_users
       WHERE status = 'Y' AND id = ?
       LIMIT ? OFFSET ?`,
      [id, limit, offset]
    );

    if (!rows?.length) {
      return res.status(404).json({ message: "No user found with that ID" });
    }

    // Process Cloudinary image
    const user = rows[0];
    let cloudinaryImages = [];

    try {
      if (user.image) {
        const parsed = JSON.parse(user.image); 
        if (Array.isArray(parsed)) {
          cloudinaryImages = parsed.map(publicId =>
            getPhotoUrl(publicId, {
              width: 400,
              crop: "thumb",
              quality: "auto"
            })
          );
        }
      }
    } catch (err) {
      console.warn("Failed to parse image public_id JSON:", err.message);
    }

    const userWithImage = {
      ...user,
      image: cloudinaryImages.length > 0 ? cloudinaryImages[0] : null // assuming 1 image max
    };

    return res.status(200).json(userWithImage);

  } catch (error) {
    console.error("Failed to fetch user:", error);
    return res.status(500).json({
      success: false,
      error: "Server error",
      message: error.message
    });
  }
};



export const registerBusinessMember = async (req, res) => {
  try {
    const {
      name, contact, cnic, address,
      postcode, email, password, role
    } = req.body;

    if (!name || !contact || !cnic || !address || !postcode || !email || !password || !role) {
      return res.status(400).json({ status: 400, message: "All fields are required" });
    }

    const uploadedLocalFilePaths = [];
    let imagePublicId = null;

    // Upload profile image to Cloudinary
    if (req.file?.path) {
      uploadedLocalFilePaths.push(req.file.path);

      try {
        const { public_id } = await uploadPhoto(req.file.path, 'profile_pictures');
        imagePublicId = public_id;

        // Cleanup local file
        try {
          await fs.access(req.file.path);
          await fs.unlink(req.file.path);
        } catch (err) {
          console.warn(`Could not delete temp file ${req.file.path}:`, err.message);
        }
      } catch (uploadError) {
        console.error("Cloudinary upload failed:", uploadError.message);
      }
    }

    const [existing] = await pool.query("SELECT * FROM tbl_users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ status: 400, message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [insertResult] = await pool.query(
      `INSERT INTO tbl_users (
        name, contact, cnic, address,
        postcode, email, password, image,
        date, role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE(), ?)`,
      [
        name,
        contact,
        cnic,
        address,
        postcode,
        email,
        hashedPassword,
        imagePublicId ? JSON.stringify([imagePublicId]) : null,
        role
      ]
    );

    const newUserId = insertResult.insertId;
    const [newUser] = await pool.query("SELECT * FROM tbl_users WHERE id = ?", [newUserId]);

    // Attach full image URL to response (optional)
    const responseUser = { ...newUser[0] };
    responseUser.imageUrl = imagePublicId ? getPhotoUrl(imagePublicId, {
      width: 400, crop: 'thumb', quality: 'auto'
    }) : null;
    delete responseUser.image; // hide public_id if you want

    res.status(201).json(responseUser);

  } catch (error) {
    console.error("Error registering business member:", error);
    res.status(500).json({ status: 500, message: "Internal Server Error" });
  }
};




export const getuploadfile = async (req, res) => {
    res.sendFile(resolve('./controllers/uploadfile.html')); 
};





export const getRegisteredMembers = async (req, res) => {
    try {
        // Default values
        const defaultLimit = 10;
        const defaultPage = 1;
        
        // Get from query params
        const entry = parseInt(req.query.entry) || defaultLimit;
        const page = parseInt(req.query.page) || defaultPage;

        const limit = Math.max(1, entry);
        const offset = (Math.max(1, page) - 1) * limit;

        // Include image column in SELECT
        const [rows] = await pool.query(
          `SELECT id, name, contact, cnic, address, postcode, 
           email, password, date, role, image
           FROM tbl_users 
           WHERE status = 'Y' 
           LIMIT ? OFFSET ?`,
          [limit, offset]
        );

        if (!rows?.length) {
          return res.status(404).json({ message: "No members found" });
        }

        // Process images with proper path resolution
        const users = await Promise.all(rows.map(async (user) => {
            try {
                if (!user.image) return { ...user, image: null };
                
                const fullPath = path.join(process.cwd(), user.image);
                if (!fs.existsSync(fullPath)) {
                    console.warn(`Image not found at path: ${fullPath}`);
                    return { ...user, image: null };
                }

                const buffer = fs.readFileSync(fullPath);
                const ext = path.extname(fullPath).toLowerCase().slice(1);
                return {
                    ...user,
                    image: `data:image/${ext};base64,${buffer.toString('base64')}`
                };
            } catch (error) {
                console.error(`Image processing failed for user ${user.id}`, error);
                return { ...user, image: null };
            }
        }));
        
        // Return users with base64 images or null
        return res.status(200).json(users);

    } catch (error) {
        console.error("Failed to fetch members:", error);
        return res.status(500).json({ 
            success: false,
            error: "Server error",
            message: error.message 
        });
    }
};





export const updateBusinessMember = async (req, res) => {
    let uploadedLocalFilePath = null; // To store path for cleanup if upload fails

    try {
        const { id } = req.params;
        const { name, contact, cnic, address, postcode, email, password, role } = req.body;

        // Validate required fields
        if (!name || !contact || !cnic || !address || !postcode || !email || !role) {
            return res.status(400).json({ status: 400, message: "All fields are required" });
        }

        // Check if user exists and get current data, including old image public ID
        const [users] = await pool.query("SELECT * FROM tbl_users WHERE id = ?", [id]);
        if (users.length === 0) {
            return res.status(404).json({ status: 404, message: "User not found" });
        }
        const user = users[0];

        // Hash password if provided
        let hashedPassword = user.password;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        // --- Cloudinary Image Handling for Update ---
        let newImagePublicId = null; // Will store the public_id of the new image
        let oldImagePublicId = null; // Will store the public_id of the old image

        // Extract old public ID from the database field
        if (user.image) {
            try {
                // Assuming 'image' column stores JSON string of public IDs, but for a single profile pic, it's likely just one.
                // If it's stored as `JSON.stringify([public_id])`, parse it. If just `public_id`, use directly.
                const parsedImage = JSON.parse(user.image);
                if (Array.isArray(parsedImage) && parsedImage.length > 0) {
                    oldImagePublicId = parsedImage[0]; // Get the first (and likely only) public ID
                } else if (typeof user.image === 'string' && user.image.startsWith('profile_pictures/')) {
                    // Fallback for direct public_id strings if not JSON array
                    oldImagePublicId = user.image;
                }
            } catch (e) {
                console.warn(`Could not parse old image public_id for user ${id}:`, e.message);
                oldImagePublicId = user.image; // Fallback to raw value if JSON parsing fails
            }
        }


        // Handle new image upload if req.file exists
        if (req.file?.path) {
            uploadedLocalFilePath = req.file.path; // Store local path for cleanup

            try {
                // Upload the new image to Cloudinary
                const { public_id } = await uploadPhoto(req.file.path, 'profile_pictures');
                newImagePublicId = public_id;

                // Cleanup new local file immediately after successful Cloudinary upload
                try {
                    await fs.access(req.file.path);
                    await fs.unlink(req.file.path);
                    uploadedLocalFilePath = null; // Mark as cleaned up
                } catch (err) {
                    console.warn(`Could not delete new temp file ${req.file.path}:`, err.message);
                }

                // If a new image was uploaded and there was an old one, delete the old one from Cloudinary
                if (oldImagePublicId) {
                    try {
                        await deletePhoto(oldImagePublicId);
                    } catch (deleteError) {
                        console.warn(`Could not delete old Cloudinary image ${oldImagePublicId}:`, deleteError.message);
                    }
                }

            } catch (uploadError) {
                console.error("Cloudinary upload failed for new image:", uploadError.message);
                // If new upload fails, retain the old image's public ID
                newImagePublicId = oldImagePublicId;
            }
        } else {
            // If no new file is uploaded, retain the existing image's public ID
            newImagePublicId = oldImagePublicId;
        }
        // --- End Cloudinary Image Handling ---



        const imageToStoreInDB = newImagePublicId ? JSON.stringify([newImagePublicId]) : null;


        await pool.query(
            `UPDATE tbl_users
             SET name = ?, contact = ?, cnic = ?, address = ?,
                 postcode = ?, email = ?, password = ?, image = ?,
                 role = ?
             WHERE id = ?`,
            [name, contact, cnic, address, postcode, email, hashedPassword,
             imageToStoreInDB, role, id]
        );

        // Get updated user data
        const [updatedUsers] = await pool.query("SELECT * FROM tbl_users WHERE id = ?", [id]);
        const updatedUser = updatedUsers[0];

        // Attach full image URL to response (optional)
        const responseUser = { ...updatedUser };
        responseUser.imageUrl = newImagePublicId ? getPhotoUrl(newImagePublicId, {
            width: 400, crop: 'thumb', quality: 'auto'
        }) : null;
        delete responseUser.image; // Hide public_id if desired

        res.status(200).json(responseUser);

    } catch (error) {
        console.error("Error updating business member:", error);

        // Clean up any local temp file if a Cloudinary upload failed
        if (uploadedLocalFilePath) {
            try {
                await fs.access(uploadedLocalFilePath);
                await fs.unlink(uploadedLocalFilePath);
                console.log(`Cleaned up local temp file: ${uploadedLocalFilePath}`);
            } catch (cleanupError) {
                console.warn(`Failed to clean up local temp file ${uploadedLocalFilePath} in error handler:`, cleanupError.message);
            }
        }
        res.status(500).json({ status: 500, message: "Internal Server Error", error: error.message });
    }
};




export const deleteBusinessMember = async (req, res) => {
    try {
        const { id } = req.params;
        const [user] = await pool.query("SELECT * FROM tbl_users WHERE id = ?", [id]);
        if (user.length === 0) {
            return res.status(404).json({ status: 404, message: "User not found" });
        }

        await pool.query("UPDATE tbl_users SET status = 'N' WHERE id = ?", [id]);
        res.status(200).json({ status: 200, message: "User Deleted successfully" });
    } catch (error) {
        console.error(" Error deactivating user:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error" });
    }
}