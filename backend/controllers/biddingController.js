import express from "express";
import pool from "../config/db.js";
import { getTimeDifference } from '../utils/timeFormat.js';

export const createBid = async (req, res) => {
  try {
    const {
      userId,
      vehicleId,
      sellerOffer,
      startTime,
      endTime,
      saleStatus,
    } = req.body;

    if (!userId || !vehicleId || !saleStatus || !startTime || !endTime) {
      return res.status(400).json({ message: "All fields are required" });
    }

    //  Format datetime correctly
    const formattedStartTime = new Date(startTime).toISOString().slice(0, 19).replace('T', ' ');
    const formattedEndTime = new Date(endTime).toISOString().slice(0, 19).replace('T', ' ');

    //  Check if bid already exists
    const [existingBid] = await pool.query(
      `SELECT * FROM tbl_bid WHERE userId = ? AND vehicleId = ?`,
      [userId, vehicleId]
    );

    if (existingBid.length > 0) {
      return res.status(400).json({ message: "Bid already exists for this vehicle" });
    }

    // Get buyNowPrice
    const [vehicleRows] = await pool.query(
      `SELECT buyNowPrice FROM tbl_vehicles WHERE id = ?`,
      [vehicleId]
    );

    if (vehicleRows.length === 0) {
      return res.status(404).json({ message: "Vehicle not found" });
    }

    const theBidPrice = vehicleRows[0].buyNowPrice;

    // Insert bid
    const [insertResult] = await pool.query(
      `INSERT INTO tbl_bid (userId, vehicleId, sellerOffer, startTime, endTime, saleStatus) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, vehicleId, sellerOffer, formattedStartTime, formattedEndTime, saleStatus]
    );

    const bidId = insertResult.insertId;

    // Update bid (auctionStatus + sellerOffer)
    await pool.query(
      `UPDATE tbl_bid SET auctionStatus = 'live', sellerOffer = ? WHERE id = ?`,
      [theBidPrice, bidId]
    );

    // Update vehicle saleStatus
    await pool.query(
      `UPDATE tbl_vehicles SET saleStatus = 'upcoming' WHERE id = ?`,
      [vehicleId]
    );

    // Get the created bid + vehicle info
    const [bid] = await pool.query(
      `SELECT v.*, b.* FROM tbl_bid b
       JOIN tbl_vehicles v ON v.id = b.vehicleId
       WHERE b.id = ?`,
      [bidId]
    );

    res.status(201).json({ message: "Bid created successfully", ...bid[0] });

  } catch (error) {
    console.error("Error creating bid:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const startBidding = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { userId, vehicleId, maxBid, monsterBid } = req.body;
    console.log("Bid request:", req.body);

    // Validate input
    if (!userId || !vehicleId || (!maxBid && !monsterBid)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          "userId, vehicleId, and either maxBid or monsterBid are required.",
      });
    }

    // Validate bid types are mutually exclusive
    if (maxBid && monsterBid) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot submit both maxBid and monsterBid",
      });
    }

    const yourOffer = maxBid || monsterBid;
    const bidType = maxBid ? "Max Bid" : "Monster Bid";

    // 1. Check if vehicle exists and is active
    const [vehicle] = await connection.query(
      'SELECT * FROM tbl_vehicles WHERE id = ? AND vehicleStatus = "Y"',
      [vehicleId]
    );

    if (vehicle.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Vehicle not found or not available for bidding",
      });
    }

    // 2. Check current sale status
    const [currentBids] = await connection.query(
      "SELECT * FROM tbl_bid WHERE vehicleId = ?",
      [vehicleId]
    );

    if (currentBids.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "No active auction found for this vehicle",
      });
    }

    const saleStatus = currentBids[0].saleStatus;
    const bidApprStatus = currentBids[0].bidApprStatus;

    // 3. Check if bidding is already completed
    if (bidApprStatus === "completed") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Bidding is already completed for this vehicle",
      });
    }

    // 4. Check for existing user bid on this vehicle
    const [existingUserBid] = await connection.query(
      "SELECT * FROM tbl_bid WHERE userId = ? AND vehicleId = ?",
      [userId, vehicleId]
    );

    let resultQuery;

    if (existingUserBid.length > 0) {
      // Update existing bid
      await connection.query(
        `UPDATE tbl_bid 
                SET yourOffer = ?, 
                    maxBid = ?, 
                    monsterBid = ?,
                    updatedAt = NOW()
                WHERE userId = ? AND vehicleId = ?`,
        [yourOffer, maxBid, monsterBid, userId, vehicleId]
      );

      // Fetch updated bid
      [resultQuery] = await connection.query(
        `SELECT v.*, b.* 
                FROM tbl_bid b
                JOIN tbl_vehicles v ON v.id = b.vehicleId 
                WHERE b.userId = ? AND b.vehicleId = ?`,
        [userId, vehicleId]
      );
    } else {
      // Create new bid
      const [insertBid] = await connection.query(
        `INSERT INTO tbl_bid 
                (userId, vehicleId, yourOffer, maxBid, monsterBid, saleStatus, bidApprStatus, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userId,
          vehicleId,
          yourOffer,
          maxBid,
          monsterBid,
          saleStatus,
          "ongoing",
        ]
      );

      // Fetch new bid
      [resultQuery] = await connection.query(
        `SELECT v.*, b.* 
                FROM tbl_bid b
                JOIN tbl_vehicles v ON v.id = b.vehicleId 
                WHERE b.id = ?`,
        [insertBid.insertId]
      );
    }

    // Update auction status
    await connection.query(
      'UPDATE tbl_bid SET auctionStatus = "live" WHERE vehicleId = ?',
      [vehicleId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `${bidType} of $${yourOffer} placed successfully`,
      bid: resultQuery[0],
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error in startBidding:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process bid",
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
};

export const upcomingAuctions = async (req, res) => {
  try {
    const [result] = await pool.query(`
    SELECT b.*, v.*, u.*
    FROM tbl_vehicles v
    JOIN tbl_bid b ON v.id = b.vehicleId
    JOIN tbl_users u ON u.id = b.userId
    WHERE
    b.auctionStatus = 'upcoming'
    AND v.vehicleStatus = 'Y'
    AND (u.role = 'seller' OR u.role = 'admin')`
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

export const endBidding = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const id = req.params.id;

    // Check if the bid exists
    const [bid] = await connection.query(`SELECT * FROM tbl_bid WHERE id = ?`, [
      id,
    ]);

    if (bid.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Bid not found",
      });
    }

    const vehicleID = bid[0].vehicleId;

    // Update all bids for this vehicle
    const [update] = await connection.query(
      `UPDATE tbl_bid SET bidApprStatus = ? WHERE vehicleId = ?`,
      ["completed", vehicleID]
    );

    if (update.affectedRows === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Failed to update bids",
      });
    }

    // Find the winning bid (highest yourOffer)
    const [result] = await connection.query(
      `
            SELECT * FROM tbl_bid
            WHERE vehicleId = ?
            ORDER BY yourOffer DESC
            LIMIT 1
        `,
      [vehicleID]
    );

    if (result.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "No bids found for this vehicle",
      });
    }

    const winnerId = result[0].userId;

    await connection.query(
      `UPDATE tbl_bid
       SET winStatus = 'Won'
       WHERE userId = ? AND vehicleId = ?
        `,
      [winnerId, vehicleID]
    );

    await connection.query(
      `
            UPDATE tbl_bid
            SET winStatus = 'Lost'
            WHERE userId != ? AND vehicleId = ?
        `,
      [winnerId, vehicleID]
    );

    const [updatedBids] = await connection.query(
      `
            SELECT * FROM tbl_bid
            WHERE vehicleId = ?
        `,
      [vehicleID]
    );

    const [final] = await pool.query(
      `select * from tbl_bid where vehicleId = ? and  winStatus = 'Won'`,
      [vehicleID]
    );

    const [getWonPeroson] = await connection.query(
      `select * from tbl_bid where vehicleId = ? and winStatus = 'Won'`,
      [vehicleID]
    );
    // let winnerMaxBid = getWonPeroson[0].maxBid || getWonPeroson[0].MonsterBid;
    // let winnerMonsterBid = getWonPeroson.winStatus
    // console.log(winnerMaxBid, vehicleID);

    // 1. Correct auctionStatus update
    await connection.query(
      `UPDATE tbl_bid SET auctionStatus = 'end', saleStatus = 'sold' WHERE vehicleId = ?`,
      [vehicleID]
    );

    await connection.query(
      `UPDATE tbl_vehicles SET saleStatus = 'sold' WHERE id = ?`,
      [vehicleID]
    );

    // 2. Correctly update the winning bid row
    const winnerRowId = getWonPeroson[0].id;

    if (getWonPeroson[0].maxBid != null) {
      await connection.query(`UPDATE tbl_bid SET maxBid = ? WHERE id = ?`, [
        getWonPeroson[0].maxBid,
        id,
      ]);
    }

    if (getWonPeroson[0].MonsterBid != null) {
      await connection.query(`UPDATE tbl_bid SET monsterBid = ? WHERE id = ?`, [
        getWonPeroson[0].MonsterBid,
        id,
      ]);
    }

    await connection.commit();

    res.status(200).json({
      ...final[0],
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error ending bidding:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

export const totalVehicles = async (req, res) => {
  try {
    const [query] = await pool.query(
      `select count(*) as totalVehicles from tbl_vehicles where vehicleStatus = 'Y'`
    );
    res.status(200).json({ totalVehicles: query[0].totalVehicles });
  } catch (error) {
    console.error("Error fetching total vehicles:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const totalLiveAuctions = async (req, res) => {
  try {
    const [query] = await pool.query(
      `select count(*) as totalLiveAuctions from tbl_bid where auctionStatus = 'live' and status = 'Y'`
    );
    res.status(200).json({ totalLiveAuctions: query[0].totalLiveAuctions });
  } catch (error) {
    console.error("Error fetching total vehicles:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const totalBidsPlaced = async (req, res) => {
  try {
    const [query] = await pool.query(`SELECT COUNT(*) AS totalBidsPlaced
              FROM tbl_users u
              LEFT JOIN tbl_bid bd ON bd.userId = u.id
              WHERE bd.auctionStatus = 'live' AND bd.status = 'Y' and u.role = 'customer'`);
    res.status(200).json({ totalBidsPlaced: query[0].totalBidsPlaced });
  } catch (error) {
    console.error("Error fetching total vehicles:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const totalUsers = async (req, res) => {
  try {
    const [query] = await pool.query(
      `select count(*) as totalUsers from tbl_users where status = 'Y'`
    );
    res.status(200).json({ totalUsers: query[0].totalUsers });
  } catch (error) {
    console.error("Error fetching total vehicles:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const updateBidStatusAdmin = async (req, res) => {
  try {
    const id = req.params.id;
    const auctionStatus ="live";
 
    if (!auctionStatus || !id){
      return res.status(400).json({ message: "Auction status or Id is missing!" });
    }
 
    const [updateQuery] = await pool.query(
      `UPDATE tbl_bid SET auctionStatus = ? WHERE id = ?`,  
      [auctionStatus, id]
    );
 
    if (updateQuery.affectedRows === 0) {
      return res.status(404).json({ message: "Bid not found or no changes made" });
    }
    const [updatedBid] = await pool.query(
      `SELECT * FROM tbl_bid WHERE id = ?`,  
      [id]
    );
 
    res.status(200).json({...updatedBid[0]});
 
  } catch (error) {
    console.error("Error updating bid status:", error);
    res.status(500).json({ message: "Internal server error" });
    res.send({error: error.message});
  }
}

export const autoUpdateToLive = async (req, res) => {
  try {
    const [bids] = await pool.query(`select * from tbl_bid where auctionStatus = 'upcoming' and startTime = NOW()`);
    if (bids.length === 0) {
      return res.status(404).json({ message: "No bids found to update to live" });
    }
    else {
      await Promise.all(bids.map(async (bid) => {
        const [updateQuery] = await pool.query(
          `UPDATE tbl_bid SET auctionStatus = 'live' WHERE id = ?`,  
          [bid.id]
        );
        if (updateQuery.affectedRows === 0) {
          console.error(`Bid with ID ${bid.id} not found or no changes made`);
        }
      }));
      res.status(200).json({ message: "Bids updated to live successfully" });
    }
  } catch (error) {
    {
    console.error("Error updating to live:", error);
    res.status(500).json({ message: "Internal server error" });
    res.send({error: error.message});
    }
  }
}

export const endTheBid = async (req, res) => {
  try{
    const id = req.params.id;

    // Check if the bid exists
    const [bid] = await pool.query(`SELECT * FROM tbl_bid WHERE id = ?`, [
      id,
    ]);

    const starttime = bid[0].startTime;
    const endtime = bid[0].endTime;
    const remainingSeconds = getTimeDifference(endtime, starttime);

    const timeout = remainingSeconds.totalSecond;

    const myTimeout = setTimeout(endbid, 5000);
    // function endbid() {
    //   const 
    // }

    res.send([timeout]);
  }catch(error){
    console.error("Error endTheBid:", error);
    res.status(500).json({ message: "Internal server error" });
    res.send({error: error.message});
  }
}