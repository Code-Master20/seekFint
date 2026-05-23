function ErrorHandler(statusCode, message, id = null, data = null) {
  //constructor function
  this.statusCode = statusCode || 500;
  this.success = false;
  this.message = message || "Something went wrong";
  this.id = id;
  this.data = data;
}

ErrorHandler.prototype.send = function (res) {
  return res.status(this.statusCode).json({
    success: this.success,
    message: this.message,
    id: this.id,
    data: this.data,
  });
};

ErrorHandler.prototype.log = function (errorName, error) {
  console.error(`${errorName} : ${error}`);
  return this;
};

module.exports = ErrorHandler;

/*
new ErrorHandler(406, "error occurring")

What happens when new ErrorHandler(...) runs?
JavaScript creates an empty object, {}
That empty object is assigned to this , this === {}
Properties are attached to this

this.success = false;
this.statusCode = 404;
this.message = "User not found";

Now the object becomes:

{
  success: false,
  statusCode: 404,
  message: "User not found"
}

JS automatically returns this
So the final result of:
const err = new ErrorHandler(404, "User not found") is :

err = {
  success: false,
  statusCode: 404,
  message: "User not found"
}


Now the PROTOTYPE part

ErrorHandler.prototype.send = function (res) {
  return res.status(this.statusCode).json({
    success: this.success,
    message: this.message,
  });
};


What is prototype?
In JavaScript:
Every function has a prototype
Objects created using new can access methods on that prototype
So every ErrorHandler instance shares ONE send function.


How send() works in real usage

const err = new ErrorHandler(401, "Unauthorized");
err.send(res)


Internally:
err does NOT contain send
JS looks up the prototype chain:
err → ErrorHandler.prototype → send ✔️

Inside send():
this.statusCode;  comes from err
this.success;  comes from err
this.message;  comes from err

So it sends:

{
  "success": false,
  "message": "Unauthorized"
}
  with HTTP status 401.


similar built in error handler --> 
const err = new Error("User not found");
err.statusCode = 404;
*/
