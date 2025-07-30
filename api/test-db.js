app.get('/api/test-db', async (req, res) => {
  try {
    const state = mongoose.connection.readyState;
    if (state !== 1) {
      return res.status(500).json({
        connected: false,
        state,
        message: 'MongoDB is NOT connected ❌'
      });
    }

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    res.json({
      connected: true,
      state,
      message: 'MongoDB connected ✅',
      collections: collections.map(c => c.name)
    });
  } catch (err) {
    res.status(500).json({
      connected: false,
      message: 'MongoDB test route error ❌',
      error: err.message
    });
  }
});
