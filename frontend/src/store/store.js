import { configureStore } from "@reduxjs/toolkit";
import { authSlice } from "../features/auth/authSlice";
export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
  },
});

/*
the above code creates a vault:a secure room or 
compartment, usually in a bank, used for storing 
money or valuables
*/
