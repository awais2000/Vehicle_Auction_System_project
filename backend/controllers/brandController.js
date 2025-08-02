import pool from "../config/db.js";
import fsSync from "fs";
import path from "path";
import { imageToBase64 } from "../utils/fileUtils.js";
import * as fs from 'fs';
import * as fsAsync from 'fs/promises'; 
import { uploadPhoto, getPhotoUrl, deleteFileFromCloudinary } from '../utils/cloudinary.js'; 



export const getBrands = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT * FROM tbl_brands WHERE status = 'Y' LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const brands = rows.map((brand) => {
      let logoUrl = null;

      try {
        if (brand.logo) {
          const parsed = JSON.parse(brand.logo);
          if (Array.isArray(parsed) && parsed.length > 0) {
            logoUrl = getPhotoUrl(parsed[0], {
              width: 300,
              crop: "fit",
              quality: "auto"
            });
          }
        }
      } catch (err) {
        console.warn(`Error parsing logo for brand ${brand.id}:`, err.message);
      }

      return {
        ...brand,
        logo: logoUrl
      };
    });

    return res.status(200).json(brands);

  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const addBrands = async (req, res) => {
    try {
        const  {brandName, logo} = req.body;
        const feilds = [brandName, logo];

        const uploadedLocalFilePaths = [];
        let imagePublicId = null;

        const misingFields  = feilds.filter(field => !req.body[field]);
        if(misingFields.lenght > 0){
            res.status(400).send({
                missingfeilds: `${misingFields.join(', ')}`
            })
        }

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
        
 
        const [query] = await pool.query(`insert into tbl_brands (brandName, logo) values (?, ?)`,      //check here without array response
            [brandName, imagePublicId ? JSON.stringify([imagePublicId]) : null]
         );

         const insertedId = query.insertId;
         console.log(insertedId);
 
         const [result] = await pool.query(`select * from tbl_brands where status = 'Y' and id = ?`,
            [insertedId]
         );
         
         // Attach full image URL to response (optional)
        const responseUser = { ...result[0] };
        responseUser.imageUrl = imagePublicId ? getPhotoUrl(imagePublicId, {
          width: 400, crop: 'thumb', quality: 'auto'
        }) : null;
        delete responseUser.image; // hide public_id if you want

        res.status(201).json(responseUser);

        res.status(200).send({...result[0]})
    } catch (error) {
        console.error("Error adding brand:", error);
        res.status(500).json({ error: "Internal server error" });
    res.send(error.message);
    }
}



export const updateBrands = async (req, res) => {
    let uploadedLocalFilePath = null; // To store path for cleanup if upload fails

    try {
        const id = req.params.id;
        const { brandName } = req.body;

        const missingFields = [];
        if (!brandName) missingFields.push('brandName');

        if (missingFields.length > 0) {
            return res.status(400).send({
                message: `Missing: ${missingFields.join(', ')}`
            });
        }

        // 1. Fetch the existing brand data to get the old logo public ID
        const [existingBrands] = await pool.query("SELECT logo FROM tbl_brands WHERE id = ?", [id]);
        if (existingBrands.length === 0) {
            return res.status(404).json({ success: false, message: "Brand not found" });
        }
        const existingBrand = existingBrands[0];

        let oldLogoPublicId = null;
        // Assuming 'logo' column stores a JSON string of public IDs, potentially just one.
        if (existingBrand.logo) {
            try {
                const parsedLogo = JSON.parse(existingBrand.logo);
                if (Array.isArray(parsedLogo) && parsedLogo.length > 0) {
                    oldLogoPublicId = parsedLogo[0]; // Get the first (and likely only) public ID
                } else if (typeof existingBrand.logo === 'string') {
                    // Fallback for direct public_id strings if not JSON array, assuming single image
                    oldLogoPublicId = existingBrand.logo;
                }
            } catch (e) {
                console.warn(`Could not parse old logo public_id for brand ${id}:`, e.message);
                oldLogoPublicId = existingBrand.logo; // Fallback to raw value if JSON parsing fails
            }
        }

        let newLogoPublicId = null; // Will store the public_id of the new logo

        // 2. Handle new logo upload if req.file exists
        if (req.file?.path) {
            uploadedLocalFilePath = req.file.path; // Store local path for cleanup

            try {
                // Upload the new image to Cloudinary (using 'brand_logos' folder)
                const { public_id } = await uploadPhoto(req.file.path, 'brand_logos');
                newLogoPublicId = public_id;

                // Cleanup new local file immediately after successful Cloudinary upload
                try {
                    await fs.access(req.file.path);
                    await fs.unlink(req.file.path);
                    uploadedLocalFilePath = null; // Mark as cleaned up
                } catch (err) {
                    console.warn(`Could not delete new temp file ${req.file.path}:`, err.message);
                }

                // 3. If a new logo was uploaded and there was an old one, delete the old one from Cloudinary
                if (oldLogoPublicId) {
                    try {
                        await deletePhoto(oldLogoPublicId);
                    } catch (deleteError) {
                        console.warn(`Could not delete old Cloudinary logo ${oldLogoPublicId}:`, deleteError.message);
                    }
                }

            } catch (uploadError) {
                console.error("Cloudinary logo upload failed:", uploadError.message);
                // If new upload fails, retain the old logo's public ID
                newLogoPublicId = oldLogoPublicId;
            }
        } else {
            // If no new file is uploaded, retain the existing logo's public ID
            newLogoPublicId = oldLogoPublicId;
        }
        // --- End Cloudinary Image Handling ---

        // Determine the logo value to store in the database
        // Store it as a JSON array string for consistency if your `logo` column holds multiple,
        // otherwise just the public_id or null.
        // Assuming your `tbl_brands.logo` is designed to hold a single image public_id,
        // but let's make it consistent with the JSON array string approach from addBrands.
        const logoToStoreInDB = newLogoPublicId ? JSON.stringify([newLogoPublicId]) : null;


        // Update brand fields
        await pool.query(`UPDATE tbl_brands SET brandName = ?, logo = ? WHERE id = ?`,
            [brandName, logoToStoreInDB, id]
        );

        const [result] = await pool.query(
            `SELECT * FROM tbl_brands WHERE status = 'Y' AND id = ?`,
            [id]
        );

        // Attach full image URL to response (optional)
        const responseBrand = { ...result[0] };
        responseBrand.logoUrl = newLogoPublicId ? getPhotoUrl(newLogoPublicId, {
            width: 200, height: 100, crop: 'fit', quality: 'auto', fetch_format: 'auto'
        }) : null;
        delete responseBrand.logo; // Hide public_id if desired

        return res.status(200).send({
            success: true,
            data: responseBrand
        });

    } catch (e) {
        console.error("Error updating brand:", e);

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

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: e.message // Include error message in dev/debug
        });
    }
};



export const deleteBrand = async (req, res) => {
    try {
        const id = req.params.id;
        // Check if sales info exists
        const [brandInfo] = await pool.query(
            'SELECT * FROM tbl_brands WHERE id = ?', 
            [id]
        );

        if (brandInfo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'brand info not found'
            });
        }

        const [deleted] = await pool.query(
            `UPDATE tbl_brands SET status = 'N' WHERE id = ?`, 
            [id]
        );

        const [result] = await pool.query(`SELECT * FROM tbl_brands WHERE id = ?`, [id]);

        res.status(200).json({
            ...result[0]
        });
    } catch (error) {
        console.error(" Error deleting brand data:", error);
        res.status(500).json({ status: 500, message: "Internal Server Error" });
    }
}
