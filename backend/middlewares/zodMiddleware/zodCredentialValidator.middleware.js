/*higher order function
Middleware factory
Middleware wrapper
Parameterized middleware
*/
const zodyCredentialValidator = (zodSchema) => async (req, res, next) => {
  try {
    const parsedData = await zodSchema.parseAsync(req.body);
    req.body = parsedData;
    next();
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = zodyCredentialValidator;
