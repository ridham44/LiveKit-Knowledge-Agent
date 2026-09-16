const User = require('../models/User');

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.toJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, gender, companyName, profileImage } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name) user.name = name;
    if (gender) user.gender = gender;
    if (companyName !== undefined) user.companyName = companyName;
    if (profileImage) user.profileImage = profileImage;

    user.updatedAt = new Date();
    await user.save();

    res.json(user.toJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
