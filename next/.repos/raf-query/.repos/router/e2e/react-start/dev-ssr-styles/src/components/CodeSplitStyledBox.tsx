import styles from '../styles/code-split-route.module.css'

export function CodeSplitStyledBox() {
  return (
    <div className={styles.styledBox} data-testid="styled-box">
      This box should have a blue background when dev styles are enabled.
    </div>
  )
}
