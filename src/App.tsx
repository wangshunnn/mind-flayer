import { Route, Router } from "@solidjs/router"
import About from "@/pages/About"
import Home from "@/pages/Home"

import "@/styles/App.css"

function App() {
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
    </Router>
  )
}

export default App
