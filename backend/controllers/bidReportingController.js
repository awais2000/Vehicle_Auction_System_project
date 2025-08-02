import { imageToBase64 } from "../utils/fileUtils.js";
import express from "express";
import pool from "../config/db.js";
import path from "path";
import fsSync from 'fs';        
import { formatingPrice } from "../utils/priceUtils.js";
import * as fs from 'fs';
import * as fsAsync from 'fs/promises'; 
import { uploadPhoto, getPhotoUrl, deleteFileFromCloudinary } from '../utils/cloudinary.js'; 



export const myBids = async (req, res) => {
  try {
    const userId = req.params.id;

    const {
      page = 1,
      limit = 10,
      search = "",
      sortField = "v.id",
      sortOrder = "DESC",
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.max(1, parseInt(limit));
    const offset = (pageNumber - 1) * limitNumber;

    let baseQuery = `
      SELECT
        b.*,
        v.*,
        b.id as bidId,
        v.image as vehicleImage
      FROM tbl_vehicles v
      JOIN tbl_bid b ON v.id = b.vehicleId
      WHERE b.userId = ? AND v.vehicleStatus = 'Y'
    `;

    let countQuery = `
      SELECT COUNT(*) as total
      FROM tbl_vehicles v
      JOIN tbl_bid b ON v.id = b.vehicleId
      WHERE b.userId = ? AND v.vehicleStatus = 'Y'
    `;

    const queryParams = [userId];
    const countParams = [userId];

    if (search) {
      const searchCondition = `
        AND (
          v.make LIKE ? OR
          v.model LIKE ? OR
          v.vin LIKE ? OR
          v.color LIKE ? OR
          b.estRetailValue LIKE ?
        )
      `;
      const searchTerm = `%${search}%`;

      baseQuery += searchCondition;
      countQuery += searchCondition;

      queryParams.push(...Array(5).fill(searchTerm));
      countParams.push(...Array(5).fill(searchTerm));
    }

    const validSortFields = [
      "v.id", "v.make", "v.model", "v.year",
      "b.maxBid", "b.estRetailValue",
    ];
    const safeSortField = validSortFields.includes(sortField) ? sortField : "v.id";
    const safeSortOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    baseQuery += ` ORDER BY ${safeSortField} ${safeSortOrder} LIMIT ? OFFSET ?`;
    queryParams.push(limitNumber, offset);

    const [result] = await pool.query(baseQuery, queryParams);
    const [[{ total }]] = await pool.query(countQuery, countParams);

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bids found matching your criteria",
      });
    }

    const formattedResult = result.map((row) => {
      const formatPriceField = (field) => {
        try {
          return formatingPrice(row[field]);
        } catch {
          return null;
        }
      };

      let cloudinaryImages = [];
      try {
        if (row.vehicleImage) {
          const parsed = JSON.parse(row.vehicleImage);
          if (Array.isArray(parsed) && parsed.length > 0) {
            cloudinaryImages = parsed.map((publicId) =>
              getPhotoUrl(publicId, {
                width: 400,
                crop: "thumb",
                quality: "auto",
              })
            );
          }
        }
      } catch (err) {
        console.warn(`Failed to parse image for bidId ${row.bidId}:`, err.message);
      }

      return {
        ...row,
        yourOffer: formatPriceField("yourOffer"),
        sellerOffer: formatPriceField("sellerOffer"),
        buyNowPrice: formatPriceField("buyNowPrice"),
        currentBid: formatPriceField("currentBid"),
        maxBid: formatPriceField("maxBid"),
        MonsterBid: formatPriceField("MonsterBid"),
        images: cloudinaryImages, // 🌐 array of URLs
      };
    });

    return res.status(200).json( formattedResult );

  } catch (error) {
    console.error("Error in myBids controller:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};



export const lotsWon = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortField = "v.id",
      sortOrder = "DESC",
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.max(1, parseInt(limit));
    const offset = (pageNumber - 1) * limitNumber;

    let baseQuery = `
      SELECT 
        v.*, 
        b.id as bidId,
        b.estRetailValue,
        b.yourOffer as MyLastBid,
        b.maxBid,
        b.MonsterBid,
        b.sellerOffer,
        v.buyNowPrice,
        v.currentBid,
        b.winStatus,
        v.image as vehicleImage
      FROM tbl_vehicles v
      JOIN tbl_bid b ON v.id = b.vehicleId
      WHERE v.vehicleStatus = 'Y' AND b.winStatus = 'Won'
    `;

    let countQuery = `
      SELECT COUNT(*) as total
      FROM tbl_vehicles v
      JOIN tbl_bid b ON v.id = b.vehicleId
      WHERE v.vehicleStatus = 'Y' AND b.winStatus = 'Won'
    `;

    const queryParams = [];
    const countParams = [];

    if (search) {
      const searchCondition = `
        AND (
          v.make LIKE ? OR 
          v.model LIKE ? OR 
          v.vin LIKE ? OR 
          v.color LIKE ? OR
          b.estRetailValue LIKE ?
        )
      `;
      const searchTerm = `%${search}%`;

      baseQuery += searchCondition;
      countQuery += searchCondition;

      queryParams.push(...Array(5).fill(searchTerm));
      countParams.push(...Array(5).fill(searchTerm));
    }

    const validSortFields = [
      "v.id", "v.make", "v.model", "v.year", "b.maxBid", "b.estRetailValue"
    ];
    const safeSortField = validSortFields.includes(sortField) ? sortField : "v.id";
    const safeSortOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    baseQuery += ` ORDER BY ${safeSortField} ${safeSortOrder} LIMIT ? OFFSET ?`;
    queryParams.push(limitNumber, offset);

    const [result] = await pool.query(baseQuery, queryParams);
    const [[{ total }]] = await pool.query(countQuery, countParams);

    if (!result.length) {
      return res.status(404).json({
        success: false,
        message: "No lots found matching your criteria",
      });
    }

    const formattedResult = result.map((row) => {
      const formatPriceField = (field) => {
        try {
          return formatingPrice(row[field]);
        } catch {
          return null;
        }
      };

      let cloudinaryImages = [];
      try {
        if (row.vehicleImage) {
          const parsed = JSON.parse(row.vehicleImage);
          if (Array.isArray(parsed)) {
            cloudinaryImages = parsed.map((publicId) =>
              getPhotoUrl(publicId, {
                width: 400,
                crop: "thumb",
                quality: "auto",
              })
            );
          }
        }
      } catch (err) {
        console.warn(`Failed to parse image JSON for bidId ${row.bidId}:`, err.message);
      }

      return {
        ...row,
        buyNowPrice: formatPriceField("buyNowPrice"),
        currentBid: formatPriceField("currentBid"),
        yourOffer: formatPriceField("MyLastBid"),
        estRetailValue: formatPriceField("estRetailValue"),
        sellerOffer: formatPriceField("sellerOffer"),
        maxBid: formatPriceField("maxBid"),
        MonsterBid: formatPriceField("MonsterBid"),
        images: cloudinaryImages,
      };
    });

    return res.status(200).json( formattedResult );

  } catch (error) {
    console.error("Error in lotsWon controller:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const lotsLost = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortField = "v.id",
      sortOrder = "DESC",
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.max(1, parseInt(limit));
    const offset = (pageNumber - 1) * limitNumber;

    let baseQuery = `
       SELECT 
        v.*, 
        b.id as bidId,
        b.estRetailValue,
        b.yourOffer as MyLastBid,
        b.maxBid,
        b.MonsterBid,
        b.sellerOffer,
        v.buyNowPrice,
        v.currentBid,
        b.winStatus,
        v.image as vehicleImage
      FROM tbl_vehicles v
      JOIN tbl_bid b ON v.id = b.vehicleId
      WHERE v.vehicleStatus = 'Y' AND b.winStatus = 'Lost'
    `;

    let countQuery = `
      SELECT COUNT(*) as total
      FROM tbl_vehicles v
      LEFT JOIN tbl_bid b ON v.id = b.vehicleId
      WHERE v.vehicleStatus = 'Y' AND b.winStatus = 'Lost'
    `;

    const queryParams = [];
    const countParams = [];

    if (search) {
      const searchCondition = `
        AND (
          v.make LIKE ? OR 
          v.model LIKE ? OR 
          v.vin LIKE ? OR 
          v.color LIKE ? OR
          b.estRetailValue LIKE ?
        )
      `;
      const searchTerm = `%${search}%`;
      baseQuery += searchCondition;
      countQuery += searchCondition;

      queryParams.push(...Array(5).fill(searchTerm));
      countParams.push(...Array(5).fill(searchTerm));
    }

    const validSortFields = [
      "v.id", "v.make", "v.model", "v.year", "b.estRetailValue"
    ];
    const safeSortField = validSortFields.includes(sortField)
      ? sortField
      : "v.id";
    const safeSortOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    baseQuery += ` ORDER BY ${safeSortField} ${safeSortOrder} LIMIT ? OFFSET ?`;
    queryParams.push(limitNumber, offset);

    const [bids] = await pool.query(baseQuery, queryParams);
    const [[{ total }]] = await pool.query(countQuery, countParams);

    if (!bids.length) {
      return res.status(404).json({
        success: false,
        message: "No lost lots found",
      });
    }

    // Format price + Cloudinary image URLs
    const formattedResult = bids.map((row) => {
      const formatPriceField = (field) => {
        try {
          return formatingPrice(row[field]);
        } catch {
          return null;
        }
      };

      let cloudinaryImages = [];
      try {
        if (row.vehicleImage) {
          const parsed = JSON.parse(row.vehicleImage);
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
        console.warn(`Failed to parse Cloudinary image JSON for bidId ${row.bidId}:`, err.message);
      }

      return {
        ...row,
        buyNowPrice: formatPriceField("buyNowPrice"),
        currentBid: formatPriceField("currentBid"),
        yourOffer: formatPriceField("MyLastBid"),
        estRetailValue: formatPriceField("estRetailValue"),
        sellerOffer: formatPriceField("sellerOffer"),
        maxBid: formatPriceField("maxBid"),
        MonsterBid: formatPriceField("monsterBid"),
        images: cloudinaryImages,
      };
    });

    return res.status(200).json( formattedResult );
  } catch (error) {
    console.error("Error in lotsLost controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const myOffers = async (req, res) => {
  try {
    // Extract query parameters with defaults
    const {
      page = 1,
      limit = 10,
      search = "",
      sortField = "v.id",
      sortOrder = "DESC",
    } = req.query;

    // Validate and parse pagination parameters
    const pageNumber = Math.max(1, parseInt(page));
    const limitNumber = Math.max(1, parseInt(limit));
    const offset = (pageNumber - 1) * limitNumber;

    // Base query
    let baseQuery = `
            SELECT v.*, b.estRetailValue, b.yourOffer, b.sellerOffer
            FROM tbl_vehicles v
            LEFT JOIN tbl_bid b ON v.id = b.vehicleId
            WHERE v.vehicleStatus = 'Y'
        `;

    // Count query for pagination
    let countQuery = `
            SELECT COUNT(*) as total
            FROM tbl_vehicles v
            LEFT JOIN tbl_bid b ON v.id = b.vehicleId
            WHERE v.vehicleStatus = 'Y'
        `;

    const queryParams = [];
    const countParams = [];

    // Add search functionality if provided
    if (search) {
      const searchCondition = `
                AND (
                    v.make LIKE ? OR 
                    v.model LIKE ? OR 
                    v.vin LIKE ? OR 
                    v.color LIKE ? OR
                    b.estRetailValue LIKE ?
                )
            `;
      const searchTerm = `%${search}%`;

      baseQuery += searchCondition;
      countQuery += searchCondition;

      // Add search term for each field (5 times)
      queryParams.push(...Array(5).fill(searchTerm));
      countParams.push(...Array(5).fill(searchTerm));
    }

    // Add sorting
    const validSortFields = [
      "v.id",
      "v.make",
      "v.model",
      "v.year",
      "b.maxBid",
      "b.estRetailValue",
    ];
    const safeSortField = validSortFields.includes(sortField)
      ? sortField
      : "b.createdAt";
    const safeSortOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    baseQuery += ` ORDER BY ${safeSortField} ${safeSortOrder}`;

    // Add pagination
    baseQuery += ` LIMIT ? OFFSET ?`;
    queryParams.push(limitNumber, offset);

    // Execute queries
    const [bids] = await pool.query(baseQuery, queryParams);
    const [[totalCount]] = await pool.query(countQuery, countParams);
    const total = totalCount.total;

    if (bids.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bids found matching your criteria",
      });
    }

    res.status(200).json(bids);
  } catch (error) {
    console.error("Error in lotsWon controller:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const liveAuctions = async (req, res) => {
  try {
    const [result] = await pool.query(`
        SELECT 
        b.id AS bidId,
        b.userId,
        b.vehicleId,
        b.estRetailValue,
        b.yourOffer,
        b.sellerOffer,
        b.bidStatus,
        b.eligibilityStatus,
        b.saleStatus,
        b.maxBid,
        b.MonsterBid,
        b.bidApprStatus,
        b.status AS bidStatusFlag,
        b.winStatus,
        b.createdAt AS bidCreatedAt,
        b.updatedAt AS bidUpdatedAt,
        b.startTime,
        b.endTime,
        b.auctionStatus,

        v.id AS vehicleId,
        v.vin,
        v.year,
        v.make,
        v.model,
        v.series,
        v.bodyStyle,
        v.engine,
        v.transmission,
        v.driveType,
        v.fuelType,
        v.color,
        v.mileage,
        v.vehicleCondition,
        v.keysAvailable,
        v.locationId,
        v.auctionDate,
        v.currentBid,
        v.buyNowPrice,
        v.vehicleStatus,
        v.image,
        v.certifyStatus,

        u.id AS userId,
        u.name,
        u.contact,
        u.cnic,
        u.address,
        u.postcode,
        u.email,
        u.date,
        u.role

      FROM tbl_vehicles v
      JOIN tbl_bid b ON v.id = b.vehicleId
      JOIN tbl_users u ON u.id = b.userId
      WHERE 
        b.auctionStatus = 'live' 
        AND v.vehicleStatus = 'Y' 
        AND (u.role = 'seller' OR u.role = 'admin')
    `);

    const formattedResult = result.map((row) => {
      // Format prices safely
      const formatPriceField = (field) => {
        try {
          return formatingPrice(row[field]);
        } catch {
          return null;
        }
      };

      let cloudinaryImages = [];
      try {
        if (row.image) {
          const parsed = JSON.parse(row.image); // Expected: ["id1", "id2", ...]
          if (Array.isArray(parsed) && parsed.length > 0) {
            cloudinaryImages = parsed.map(publicId =>
              getPhotoUrl(publicId, {
                width: 400,
                crop: "thumb",
                quality: "auto",
              })
            );
          }
        }
      } catch (err) {
        console.warn(`Failed to parse image array for bidId ${row.bidId}:`, err.message);
      }


      return {
        ...row,
        yourOffer: formatPriceField("yourOffer"),
        sellerOffer: formatPriceField("sellerOffer"),
        buyNowPrice: formatPriceField("buyNowPrice"),
        currentBid: formatPriceField("currentBid"),
        maxBid: formatPriceField("maxBid"),
        MonsterBid: formatPriceField("MonsterBid"),
        images: cloudinaryImages,
      };
    });

    return res.status(200).json(formattedResult);
  } catch (error) {
    console.error("Error in live Auctions controller:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const liveAuctionsById = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID parameter is required",
      });
    }

    const [result] = await pool.query(
      `SELECT b.*, v.*, u.*
      FROM tbl_vehicles v
      JOIN tbl_bid b ON v.id = b.vehicleId
      JOIN tbl_users u ON u.id = b.userId
      WHERE
        b.id = ?
        AND
        b.auctionStatus = 'live'
        AND v.vehicleStatus = 'Y'
        AND (u.role = 'seller' OR u.role = 'admin')`,
            [id]
          );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in live Auctions controller:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const upcomingAuctions = async (req, res) => {
  try {
    const [result] = await pool.query(`
      SELECT 
        b.id AS bidId,
        b.userId,
        b.vehicleId,
        b.estRetailValue,
        b.yourOffer,
        b.sellerOffer,
        b.bidStatus,
        b.eligibilityStatus,
        b.saleStatus,
        b.maxBid,
        b.MonsterBid,
        b.bidApprStatus,
        b.status AS bidStatusFlag,
        b.winStatus,
        b.createdAt AS bidCreatedAt,
        b.updatedAt AS bidUpdatedAt,
        b.startTime,
        b.endTime,
        b.auctionStatus,

        v.id AS vehicleId,
        v.vin,
        v.year,
        v.make,
        v.model,
        v.series,
        v.bodyStyle,
        v.engine,
        v.transmission,
        v.driveType,
        v.fuelType,
        v.color,
        v.mileage,
        v.vehicleCondition,
        v.keysAvailable,
        v.locationId,
        v.auctionDate,
        v.currentBid,
        v.buyNowPrice,
        v.vehicleStatus,
        v.image,
        v.certifyStatus,

        u.id AS userId,
        u.name,
        u.contact,
        u.cnic,
        u.address,
        u.postcode,
        u.email,
        u.date,
        u.role

      FROM tbl_bid b
      JOIN tbl_vehicles v ON v.id = b.vehicleId
      JOIN tbl_users u ON u.id = b.userId
      WHERE
        b.auctionStatus = 'upcoming'
        AND v.vehicleStatus = 'Y'
        AND (u.role = 'seller' OR u.role = 'admin')
    `);

   const formattedResult = result.map((row) => {
      // Format prices safely
      const formatPriceField = (field) => {
        try {
          return formatingPrice(row[field]);
        } catch {
          return null;
        }
      };

      let cloudinaryImages = [];
      try {
        if (row.image) {
          const parsed = JSON.parse(row.image); 
          if (Array.isArray(parsed) && parsed.length > 0) {
            cloudinaryImages = parsed.map(publicId =>
              getPhotoUrl(publicId, {
                width: 400,
                crop: "thumb",
                quality: "auto",
              })
            );
          }
        }
      } catch (err) {
        console.warn(`Failed to parse image array for bidId ${row.bidId}:`, err.message);
      }


      return {
        ...row,
        yourOffer: formatPriceField("yourOffer"),
        sellerOffer: formatPriceField("sellerOffer"),
        buyNowPrice: formatPriceField("buyNowPrice"),
        currentBid: formatPriceField("currentBid"),
        maxBid: formatPriceField("maxBid"),
        MonsterBid: formatPriceField("MonsterBid"),
        images: cloudinaryImages,
      };
    });

    return res.status(200).json(formattedResult);


      } catch (error) {
        console.error("Failed to fetch Vehicles:", error);
        return res.status(500).json({
          success: false,
          error: "Internal server error",
          message: error.message,
        });
      }
};


export const auctionHistory = async (req, res) => {
  try {
    const [result] = await pool.query(`
SELECT b.*, v.*, u.*
FROM tbl_vehicles v
JOIN tbl_bid b ON v.id = b.vehicleId
JOIN tbl_users u ON u.id = b.userId
WHERE
  b.auctionStatus = 'end'
  AND v.vehicleStatus = 'Y'
  AND (u.role = 'seller' OR u.role = 'admin')`);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in live Auctions controller:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};  


export const getCertifiedVehicles = async (req, res) => {
  try {
    const [vehicles] = await pool.query(`
      SELECT * FROM tbl_vehicles
      WHERE vehicleStatus = 'Y' AND certifyStatus = 'Certified'
    `);

    const vehiclesWithImages = vehicles.map((vehicle) => {
      let cloudinaryImages = [];

      // Parse Cloudinary image public_ids
      try {
        if (vehicle.image) {
          const parsed = JSON.parse(vehicle.image); // Expecting: ["id1", "id2"]
          if (Array.isArray(parsed)) {
            cloudinaryImages = parsed.map((publicId) =>
              getPhotoUrl(publicId, {
                width: 400,
                crop: "thumb",
                quality: "auto",
              })
            );
          }
        }
      } catch (err) {
        console.warn(`Error parsing images for vehicle ${vehicle.id}:`, err.message);
      }

      return {
        ...vehicle,
        buyNowPrice: formatingPrice(vehicle.buyNowPrice),
        images: cloudinaryImages, // array of URLs
      };
    });

    res.status(200).json(vehiclesWithImages);
  } catch (error) {
    console.error("Error fetching certified vehicles!:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const getNonCertifiedVehicles = async (req, res) => {
  try {
    const [vehicles] = await pool.query(`
      SELECT * FROM tbl_vehicles
      WHERE vehicleStatus = 'Y' AND certifyStatus = 'Non-Certified'
    `);

    const vehiclesWithImages = vehicles.map((vehicle) => {
      let cloudinaryImages = [];

      try {
        if (vehicle.image) {
          const parsed = JSON.parse(vehicle.image); // Expected: ["id1", "id2"]
          if (Array.isArray(parsed)) {
            cloudinaryImages = parsed.map((publicId) =>
              getPhotoUrl(publicId, {
                width: 400,
                crop: "thumb",
                quality: "auto",
              })
            );
          }
        }
      } catch (err) {
        console.warn(`Error parsing image data for vehicle ${vehicle.id}:`, err.message);
      }

      return {
        ...vehicle,
        buyNowPrice: formatingPrice(vehicle.buyNowPrice),
        images: cloudinaryImages,
      };
    });

    res.status(200).json(vehiclesWithImages);

  } catch (error) {
    console.error("Error fetching non-certified vehicles:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const getVehiclesById = async (req, res) => {
  try {
    const id = req.params.id;

    const {
      year,
      auctionDate,
      auctionDateStart,
      auctionDateEnd,
      yearMin,
      yearMax,
      make,
      model,
      series,
      bodyStyle,
      engine,
      transmission,
      driveType,
      fuelType,
      color,
      search,
    } = req.query;

    const defaultLimit = 10;
    const defaultPage = 1;

    const entry = parseInt(req.query.entry) || defaultLimit;
    const page = parseInt(req.query.page) || defaultPage;

    const limit = Math.max(1, entry);
    const offset = (Math.max(1, page) - 1) * limit;

    let query = `SELECT * FROM tbl_vehicles WHERE 1=1 AND vehicleStatus = 'Y'`;
    let countQuery = `SELECT COUNT(*) as total FROM tbl_vehicles WHERE 1=1 AND vehicleStatus = 'Y'`;
    const params = [];
    const countParams = [];

    // Filters
    if (auctionDateStart && auctionDateEnd) {
      query += ` AND auctionDate BETWEEN ? AND ?`;
      countQuery += ` AND auctionDate BETWEEN ? AND ?`;
      params.push(auctionDateStart, auctionDateEnd);
      countParams.push(auctionDateStart, auctionDateEnd);
    } else if (auctionDate) {
      query += ` AND auctionDate = ?`;
      countQuery += ` AND auctionDate = ?`;
      params.push(auctionDate);
      countParams.push(auctionDate);
    }

    if (yearMin && yearMax) {
      query += ` AND year BETWEEN ? AND ?`;
      countQuery += ` AND year BETWEEN ? AND ?`;
      params.push(yearMin, yearMax);
      countParams.push(yearMin, yearMax);
    } else if (year) {
      query += ` AND year = ?`;
      countQuery += ` AND year = ?`;
      params.push(year);
      countParams.push(year);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query += ` AND (make LIKE ? OR model LIKE ? OR series LIKE ? OR bodyStyle LIKE ? OR color LIKE ?)`;
      countQuery += ` AND (make LIKE ? OR model LIKE ? OR series LIKE ? OR bodyStyle LIKE ? OR color LIKE ?)`;
      const terms = Array(5).fill(searchTerm);
      params.push(...terms);
      countParams.push(...terms);
    }

    const filters = {
      make,
      model,
      series,
      bodyStyle,
      engine,
      transmission,
      driveType,
      fuelType,
      color,
    };

    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        query += ` AND ${key} = ?`;
        countQuery += ` AND ${key} = ?`;
        params.push(value);
        countParams.push(value);
      }
    }

    query += ` AND id = ? ORDER BY auctionDate DESC LIMIT ? OFFSET ?`;
    params.push(id, limit, offset);

    const [vehicles] = await pool.query(query, params);
    if (!vehicles.length) {
      return res.status(404).json({ message: "No vehicles found" });
    }

    const [totalVehicles] = await pool.query(countQuery, countParams);
    const total = totalVehicles[0].total;

    // Process vehicles with Cloudinary images
    const vehiclesWithImages = await Promise.all(
      vehicles.map(async (vehicle) => {
        const processedVehicle = { ...vehicle };

        //  Price formatting
        try {
          processedVehicle.buyNowPrice = formatingPrice(vehicle.buyNowPrice);
        } catch (err) {
          console.warn(`Error formatting buyNowPrice for vehicle ${vehicle.id}:`, err.message);
          processedVehicle.buyNowPrice = null;
        }

        try {
          processedVehicle.currentBid = formatingPrice(vehicle.currentBid);
        } catch (err) {
          console.warn(`Error formatting currentBid for vehicle ${vehicle.id}:`, err.message);
          processedVehicle.currentBid = null;
        }

        //  Cloudinary image array
        let cloudinaryImages = [];
        try {
          if (vehicle.image) {
            const parsed = JSON.parse(vehicle.image); // ["public_id1", "public_id2"]
            if (Array.isArray(parsed)) {
              cloudinaryImages = parsed.map((publicId) =>
                getPhotoUrl(publicId, {
                  width: 400,
                  crop: "thumb",
                  quality: "auto",
                })
              );
            }
          }
        } catch (err) {
          console.warn(`Error parsing image JSON for vehicle ${vehicle.id}:`, err.message);
        }

        processedVehicle.images = cloudinaryImages;
        delete processedVehicle.image; // remove raw DB field

        return processedVehicle;
      })
    );

    return res.status(200).json({
      ...vehiclesWithImages[0],
      totalRecords: total,
      page,
      perPage: limit
    });

  } catch (error) {
    console.error("Failed to fetch vehicle by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const bidsPlacedById = async (req, res) => {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({ message: "Please provide the ID" });
    }

    const [result] = await pool.query(
      `
      SELECT        
        b.id AS bidId,
        b.userId,
        b.vehicleId,
        b.estRetailValue,
        b.yourOffer,
        b.sellerOffer,
        b.bidStatus,
        b.eligibilityStatus,
        b.saleStatus,
        b.maxBid,
        b.MonsterBid,
        b.bidApprStatus,
        b.status AS bidStatusFlag,
        b.winStatus,
        b.createdAt AS bidCreatedAt,
        b.updatedAt AS bidUpdatedAt,
        b.startTime,
        b.endTime,
        b.auctionStatus,

        v.id AS vehicleId,
        v.vin,
        v.year,
        v.make,
        v.model,
        v.series,
        v.bodyStyle,
        v.engine,
        v.transmission,
        v.driveType,
        v.fuelType,
        v.color,
        v.mileage,
        v.vehicleCondition,
        v.keysAvailable,
        v.locationId,
        v.auctionDate,
        v.currentBid,
        v.buyNowPrice,
        v.vehicleStatus,
        v.image,
        v.certifyStatus,

        u.id AS userId,
        u.name,
        u.contact,
        u.cnic,
        u.address,
        u.postcode,
        u.email,
        u.date,
        u.role

      FROM tbl_vehicles v 
      JOIN tbl_bid b ON v.id = b.vehicleId
      JOIN tbl_users u ON u.id = b.userId
      WHERE b.status = 'Y'
        AND u.role = 'customer'
        AND b.vehicleId = ?
    `,
      [id]
    );

    if (!result.length) {
      return res.status(404).json({ message: "No bids found for this vehicle" });
    }

    const formattedResult = result.map((row) => {
      // Format prices safely
      const formatPriceField = (field) => {
        try {
          return formatingPrice(row[field]);
        } catch {
          return null;
        }
      };

      let cloudinaryImages = [];
      try {
        if (row.image) {
          const parsed = JSON.parse(row.image); // Expected: ["id1", "id2", ...]
          if (Array.isArray(parsed) && parsed.length > 0) {
            cloudinaryImages = parsed.map(publicId =>
              getPhotoUrl(publicId, {
                width: 400,
                crop: "thumb",
                quality: "auto",
              })
            );
          }
        }
      } catch (err) {
        console.warn(`Failed to parse image array for bidId ${row.bidId}:`, err.message);
      }


      return {
        ...row,
        yourOffer: formatPriceField("yourOffer"),
        sellerOffer: formatPriceField("sellerOffer"),
        buyNowPrice: formatPriceField("buyNowPrice"),
        currentBid: formatPriceField("currentBid"),
        maxBid: formatPriceField("maxBid"),
        MonsterBid: formatPriceField("MonsterBid"),
        images: cloudinaryImages,
      };
    });

    return res.status(200).json(formattedResult);

  } catch (err) {
    console.error("Failed to fetch bidsPlacedById:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};


export const purchasedVehicleData = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).send({
                message: "Please provide id of the vehicle!"
            });
        }

        const [result] = await pool.query(`
            SELECT
                v.id AS vehicleId,
                v.vin,
                v.year,
                v.make,
                v.model,
                v.series,
                v.bodyStyle,
                v.engine,
                v.transmission,
                v.driveType,
                v.fuelType,
                v.color,
                v.mileage,
                v.vehicleCondition,
                v.keysAvailable,
                v.locationId,
                v.auctionDate,
                v.currentBid,
                v.buyNowPrice,
                v.vehicleStatus,
                v.image,
                v.certifyStatus,
                u.id AS userId,
                u.name,
                u.contact,
                u.cnic,
                u.address,
                u.postcode,
                u.email,
                u.date,
                u.role,
                b.maxBid,
                b.MonsterBid,
                b.winStatus,
                b.id AS bidId 
            FROM tbl_vehicles v
            JOIN tbl_bid b ON v.id = b.vehicleId
            JOIN tbl_users u ON u.id = b.userId
            WHERE b.status = 'Y' AND winStatus = 'Won' AND role = 'customer' AND b.vehicleId = ?`,
            [id]
        );

        if (result.length === 0) {
            return res.status(404).send({
                message: "No purchasing data for this vehicle found!"
            });
        }
        
        const formattedResult = result.map((row) => {
      // Format prices safely
      const formatPriceField = (field) => {
        try {
          return formatingPrice(row[field]);
        } catch {
          return null;
        }
      };

      let cloudinaryImages = [];
      try {
        if (row.image) {
          const parsed = JSON.parse(row.image); // Expected: ["id1", "id2", ...]
          if (Array.isArray(parsed) && parsed.length > 0) {
            cloudinaryImages = parsed.map(publicId =>
              getPhotoUrl(publicId, {
                width: 400,
                crop: "thumb",
                quality: "auto",
              })
            );
          }
        }
      } catch (err) {
        console.warn(`Failed to parse image array for bidId ${row.bidId}:`, err.message);
      }


      return {
        ...row,
        yourOffer: formatPriceField("yourOffer"),
        sellerOffer: formatPriceField("sellerOffer"),
        buyNowPrice: formatPriceField("buyNowPrice"),
        currentBid: formatPriceField("currentBid"),
        maxBid: formatPriceField("maxBid"),
        MonsterBid: formatPriceField("MonsterBid"),
        images: cloudinaryImages,
      };
    });

    return res.status(200).json(formattedResult);

    } catch (error) {
        console.error("Failed to fetch purchased vehicle data:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
};