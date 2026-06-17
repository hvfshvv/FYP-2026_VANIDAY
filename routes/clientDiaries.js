const express = require('express');
const router = express.Router();
const clientDiariesController = require('../controllers/clientDiariesController');

router.get('/', clientDiariesController.showClientDiaries);
router.get('/images/:postId', clientDiariesController.showPostImage);

module.exports = router;
