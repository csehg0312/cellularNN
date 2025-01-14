import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import './index.css';

// Lazy load the components for different routes
const Home = lazy(() => import('./pages/Home'));
const STX = lazy(() => import('./pages/STX'));
const PhotoCNN = lazy(() => import('./pages/PhotoCNN'));
const VideoCNN = lazy(() => import('./pages/VideoCNN'));
const Licenses = lazy(() => import('./pages/Licenses'));

// Define the root App component that wraps the children;

// Render the application with the Router and Routes
render(() => (
  <Router>
    <Route path="/" component={Home} />
    <Route path="/videocnn" component={VideoCNN} />
    <Route path="/photocnn" component={PhotoCNN} />
    <Route path="/stx" component={STX} />
    <Route path="/licenses" component={Licenses} />
  </Router>
), document.getElementById("root"));
