//this is consodered to be a slice (a piece of store)
//slice directory name is authSlice
//Each slice has initial state and reducers(inside we defined logic)
import { createSlice } from "@reduxjs/toolkit";

//initial state
const initialState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

//reducers, an object of functions that describe how the state changes when actions are dispatched
//fn receives current state from the initialState initially and/or receives action through
// action dispatcher from components
//and update the currrent states with action.payload
const reducers = {
  loginStart(state) {
    // state is basically initialState's prototypic instance similar to the this.user we defined in constructor
    //state points at current state, initially extracted from initialState object
    state.loading = true;
    state.error = null;
  },

  loginSuccess(state, action) {
    state.loading = false;
    state.user = action.payload;
    state.isAuthenticated = true;
  },
  loginFailure(state, action) {
    state.loading = false;
    state.error = action.payload;
  },
  logout(state) {
    state.user = null;
    state.isAuthenticated = false;
  },
};

export const authSlice = createSlice({
  name: "auth", //to identify slice distinctly
  initialState,
  reducers,
});

// export const { loginStart, loginSuccess, loginFailure, logout } =
//   authSlice.actions;

// export default authSlice.reducer;
