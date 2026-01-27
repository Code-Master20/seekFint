/*higher order function
Middleware factory
Middleware wrapper
Parameterized middleware
*/
const zodyCredentialValidator = (zodSchema) => async (req, res, next) => {
  try {
    const parsedData = await schema.parseAsync(req.body);
    req.body = parsedData;
    next();
  } catch (error) {
    console.log(error);
  }
};

module.exports = zodyCredentialValidator;
