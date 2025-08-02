import express from  'express';
import { authenticateToken, isAdmin, isSeller, isMember } from "../middlewares/authMiddleware.js";
import  {getuploadfile, login, registerBusinessMember, getRegisteredMembers, updateBusinessMember, deleteBusinessMember, getUsersById}  from '../controllers/authController.js';
import { upload } from "../middlewares/uploadMiddleware.js"; 
import { addCalenderEvent } from '../controllers/calenderController.js';
import { sendAlert, getAlerts } from '../controllers/alertController.js';
import { addTransactionData, getTransactionData, updateTransactionData, deleteTransactionData, createPaymentIntent, fundDeposit, updateFundDeposit, getFundDeposit, addFundWithdrawl, updateFundWithdrawl, getFundWithdrawl } from '../controllers/paymentController.js';
import {addLocation} from '../controllers/locationController.js'
import { deleteSellerIndividuals, getSellerIndividuals, updateIndividual } from '../controllers/sellVehicle.js';
import { addAboutPageData, addHomePageData, deleteAboutPageData, deleteHomePage, getAboutPageData, getHomePageData, updateAboutPageData, updateHomePageData } from '../controllers/homePageController.js';
import { getContactUs } from '../controllers/contactUsController.js';
import { addVehiclePrices, addVehicleSpecs, deleteVehiclePrices, deleteVehicleSpecs, getVehiclePrices, updateVehiclePrices, updateVehicleSpecs } from '../controllers/featureSpecController.js';
import { autoUpdateToLive, updateBidStatusAdmin } from '../controllers/biddingController.js';
import { addBrands, deleteBrand, getBrands, updateBrands } from '../controllers/brandController.js';
import { uploadVehicleImages } from '../middlewares/uploadMiddleware2.js';
import { bidsPlacedById, purchasedVehicleData } from '../controllers/bidReportingController.js';
import { checkVehicles } from '../controllers/vehicleController.js';

const app = express();


export default app => {
    //some HTML files:
    app.get('/getuploadfile', getuploadfile);

    //Login:
    app.post('/login', login);

    //Home 
    app.post('/addHomePage', addHomePageData);

    app.get('/home', getHomePageData);

    app.put('/updateHomePage/:id', updateHomePageData);

    app.patch('/deleteHomePage/:id', deleteHomePage);

    //Register:
    app.get('/admin/getUsersById/:id',  getUsersById);

    app.post('/register', upload.single("image"), registerBusinessMember);

    app.get('/admin/getRegisteredMembers',  getRegisteredMembers);

    app.put('/admin/updateRegisterUsers/:id', upload.single("image"), updateBusinessMember);

    app.patch('/admin/deleteRegisterUsers/:id', deleteBusinessMember);  

    app.post('/admin/addCalenderEvent', addCalenderEvent); 

    app.post('/admin/sendAlert', sendAlert);

    app.get('/admin/getAlerts', getAlerts);

    app.post('/admin/addTransactionData', addTransactionData);

    app.get('/admin/getTransactionData', getTransactionData);

    app.put('/admin/updateTransactionData/:id', updateTransactionData);

    app.patch('/admin/deleteTransactionData/:id', deleteTransactionData);

    app.post('/admin/createPayment', createPaymentIntent);

    app.get('/admin/getFundDeposit', getFundDeposit);

    app.post('/admin/fundDeposit', fundDeposit);

    app.put('/admin/updateFundDeposit/:id', updateFundDeposit);

    app.post('/admin/addFundWithdrawl', addFundWithdrawl);

    app.put('/admin/updateFundWithdrawl/:id', updateFundWithdrawl);

    app.get('/admin/getFundWithdrawl', getFundWithdrawl);

    app.put('/admin/updateIndiviual/:id', updateIndividual);

    app.get('/admin/getSellerIndividuals', getSellerIndividuals);

    app.patch('/admin/deleteSeller/:id', deleteSellerIndividuals);

    app.post('/admin/addAboutPageData', addAboutPageData);

    app.get('/admin/getAboutPageData', getAboutPageData);

    app.put('/admin/updateAboutPageData/:id', updateAboutPageData);

    app.delete('/admin/deleteAboutPageData/:id', deleteAboutPageData);

    app.post('/admin/getContactUs', getContactUs);

    app.post('/admin/addVehiclePrices', addVehiclePrices);   
    
    app.get('/admin/getVehiclePrices', getVehiclePrices);

    app.put('/admin/updateVehiclePrices/:id', updateVehiclePrices);

    app.patch('/admin/deleteVehiclePrices/:id', deleteVehiclePrices);

    app.post('/admin/addVehicleSpecs', addVehicleSpecs);

    app.get('/admin/getVehicleSpecs', getVehiclePrices); 

    app.put('/admin/updateVehicleSpecs/:id', updateVehicleSpecs);

    app.patch('/member/deleteVehicleSpecs/:id', deleteVehicleSpecs);

    app.put('/admin/updateBidStatusAdmin/:id', updateBidStatusAdmin);

    app.post('/autoUpdateToLive', autoUpdateToLive);

    app.post('/admin/addBrand', upload.single("logo"), addBrands);

    app.get('/admin/getBrands', getBrands);

    app.put('/admin/updateBrand/:id', upload.single("logo"), updateBrands); // //changes required

    app.patch('/admin/deleteBrand/:id', deleteBrand); // //changes required

    app.get('/admin/bidsPlacedById/:id', bidsPlacedById);

    app.get('/admin/getPurchasedVehicleData/:id', purchasedVehicleData);

    app.get('/checkVehicles', checkVehicles);
};