import Engraving from './Engraving.tsx'

/** The church's page: its engraving on a sheet with a caption, drawn in once when the page opens. */
export default function EngravingStage({ id, name }: { id: string; name: string }) {
  return (
    <figure className="engraving-stage">
      <Engraving id={id} label={`Grabado de ${name}`} draw />
      <figcaption className="rpg-label" aria-hidden="true">{name}</figcaption>
    </figure>
  )
}
