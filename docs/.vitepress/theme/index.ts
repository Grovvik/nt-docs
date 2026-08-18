import DefaultTheme from 'vitepress/theme'
import type { App } from 'vue'
import './custom.css'

import GlossaryTerm from './components/GlossaryTerm.vue'
import DecompiledCode from './components/DecompiledCode.vue'
import BootTimeline from './components/BootTimeline.vue'
import BootFlowGraph from './components/BootFlowGraph.vue'
import FunctionCard from './components/FunctionCard.vue'
import GlossaryView from './components/GlossaryView.vue'
import MermaidDiagram from './components/MermaidDiagram.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component('GlossaryTerm', GlossaryTerm)
    app.component('Term', GlossaryTerm)
    app.component('DecompiledCode', DecompiledCode)
    app.component('BootTimeline', BootTimeline)
    app.component('BootFlowGraph', BootFlowGraph)
    app.component('FunctionCard', FunctionCard)
    app.component('GlossaryView', GlossaryView)
    app.component('MermaidDiagram', MermaidDiagram)
  }
}
