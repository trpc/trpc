import styles from '../styles/code-split-route.module.css'

export function CodeSplitStyledBox() {
  return (
    <div class={styles.styledBox} data-testid="styled-box">
      This box is styled by a code-split route component.
    </div>
  )
}
