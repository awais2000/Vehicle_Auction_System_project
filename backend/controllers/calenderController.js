import express from "express";
import pool from "../config/db.js";

export const addCalenderEvent = async (req, res) => {
  try {
    const { date, day, location } = req.body;

    const requiredFields = ["date", "day", "location"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Store array as JSON string
    const locationJson = JSON.stringify(location);

    const [insertCalendarEvent] = await pool.query(
      `INSERT INTO tbl_calender (date, day, location)
       VALUES (?, ?, ?)`,
      [date, day, locationJson]
    );

    const id = insertCalendarEvent.insertId;

    const [result] = await pool.query(
      `SELECT * FROM tbl_calender WHERE id = ?`,
      [id]
    );

    // Convert location string back to array before sending response
    const finalResult = {
      ...result[0],
      location: JSON.parse(result[0].location),
    };

    console.log("Calendar event added:", finalResult);

    res.status(200).json(finalResult);
  } catch (error) {
    console.error("Error adding calendar event:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const getCalenderEvents = async (req, res) => {
  try {
    const [getCalender] = await pool.query(
      `SELECT * FROM tbl_calender WHERE status = 'Y'`
    );

    if (!getCalender?.length) {
      return res.status(404).json({ message: "No calendar events found" });
    }

    const formattedEvents = getCalender.map((event) => ({
      ...event,
      location: JSON.parse(event.location),
    }));

    res.status(200).json(formattedEvents);
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateCalenderEvent = async (req, res) => {
  try {
    const id = req.params.id;
    const { date, day, location } = req.body;

    console.log(req.body);

    // Validate required fields
    const requiredFields = ["date", "day", "location"];

    const locationJson = JSON.stringify(location);

    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const [query] = await pool.query(
      `update tbl_calender set userId = ?, vehicleId = ?, date = ?, day = ?, location = ? where id = ?`,
      [date, day, locationJson, id]
    );

    const [result] = await pool.query(
      `select * from tbl_calender where id = ?`,
      [id]
    );

    res.status(200).json({
      ...result[0],
    });
  } catch (error) {
    console.error(" Error updating calendar event:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const deleteCalenderEvent = async (req, res) => {
  try {
    const id = req.params.id;
    // Check if calendar event exists
    const [event] = await pool.query(
      "SELECT * FROM tbl_calender WHERE id = ?",
      [id]
    );

    if (event.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Calendar event not found",
      });
    }

    await pool.query(`update tbl_calender set status = 'N' where id = ?`, [id]);

    const [getDeleted] = await pool.query(
      `select * from tbl_calender where id = ?`,
      [id]
    );

    res.status(200).json({
      ...getDeleted[0],
      message: "Calendar event deleted successfully",
    });
  } catch (error) {
    console.error(" Error deleting calendar event:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
