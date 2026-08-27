import { connection } from "next/server";
import { getHomeData } from "@/lib/home-data";
import type {
  HomeData,
  PropertyContentRow,
  PropertyRow,
  PublicPropertyMedia,
  ReviewRow,
} from "@/types/home";
import styles from "@/app/page.module.css";

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return `${value} ${value > 1 ? pluralForm : singular}`;
}

function formatPrice(property: PropertyRow): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: property.currency,
    maximumFractionDigits: 0,
  }).format(property.base_nightly_price);
}

function formatTime(value: string): string {
  return value.slice(0, 5).replace(":", " h ");
}

function formatAmenity(value: string): string {
  const label = value.replaceAll("_", " ").trim();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : value;
}

function reviewDate(value: string | null): string | null {
  if (!value) return null;

  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function heroBackground(media: PublicPropertyMedia | undefined) {
  if (!media) return undefined;

  return {
    backgroundImage: `linear-gradient(180deg, rgb(20 38 27 / 8%), rgb(20 38 27 / 62%)), url("${media.url}")`,
  };
}

function PropertyOverview({
  property,
  content,
}: {
  property: PropertyRow;
  content: PropertyContentRow;
}) {
  const facts = [
    { label: "Capacité", value: plural(property.max_guests, "voyageur") },
    { label: "Chambres", value: plural(content.bedrooms, "chambre") },
    { label: "Salles de bain", value: plural(content.bathrooms, "salle de bain") },
    { label: "À partir de", value: `${formatPrice(property)} / nuit` },
  ];

  return (
    <section className={styles.discovery} id="decouvrir" aria-labelledby="discovery-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>La maison</p>
        <h2 id="discovery-title">L’essentiel, naturellement.</h2>
      </div>
      <div className={styles.facts}>
        {facts.map((fact) => (
          <div className={styles.fact} key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>
        ))}
      </div>
      <div className={styles.stayDetails}>
        <p>
          Arrivée à partir de <strong>{formatTime(content.check_in_time)}</strong>
        </p>
        <p>
          Départ avant <strong>{formatTime(content.check_out_time)}</strong>
        </p>
        <p>
          Séjour minimum : <strong>{plural(property.base_minimum_nights, "nuit")}</strong>
        </p>
      </div>
      {content.amenities.length > 0 && (
        <div className={styles.amenities}>
          <h3>Équipements</h3>
          <ul>
            {content.amenities.map((amenity) => (
              <li key={amenity}>{formatAmenity(amenity)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function MediaGallery({ media }: { media: PublicPropertyMedia[] }) {
  return (
    <section className={styles.dataSection} aria-labelledby="media-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>En images</p>
        <h2 id="media-title">Découvrez les lieux.</h2>
      </div>
      {media.length > 0 ? (
        <div className={styles.mediaGrid}>
          {media.map((item) => (
            <figure className={styles.mediaCard} key={item.id}>
              <div
                className={styles.mediaImage}
                style={{ backgroundImage: `url("${item.url}")` }}
                role="img"
                aria-label={item.alt_text}
              />
              {item.caption && <figcaption>{item.caption}</figcaption>}
            </figure>
          ))}
        </div>
      ) : (
        <p className={styles.inlineEmpty}>Les photos de la maison seront bientôt disponibles.</p>
      )}
    </section>
  );
}

function Rating({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(5, Math.round(value)));

  return (
    <span className={styles.rating} role="img" aria-label={`${normalized} étoiles sur 5`}>
      {"★".repeat(normalized)}
      <span aria-hidden="true">{"☆".repeat(5 - normalized)}</span>
    </span>
  );
}

function Reviews({ reviews }: { reviews: ReviewRow[] }) {
  return (
    <section className={styles.dataSection} aria-labelledby="reviews-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>Ils ont séjourné ici</p>
        <h2 id="reviews-title">Des souvenirs partagés.</h2>
      </div>
      {reviews.length > 0 ? (
        <div className={styles.reviewGrid}>
          {reviews.map((review) => {
            const date = reviewDate(review.stay_month);
            return (
              <article className={styles.review} key={review.id}>
                <Rating value={review.rating} />
                <blockquote>“{review.comment}”</blockquote>
                <footer>
                  <strong>{review.display_name}</strong>
                  {(date || review.source) && (
                    <span>{[date, review.source].filter(Boolean).join(" · ")}</span>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <p className={styles.inlineEmpty}>Aucun avis n’est publié pour le moment.</p>
      )}
    </section>
  );
}

function HomeState({ error = false }: { error?: boolean }) {
  return (
    <section
      className={styles.statePanel}
      role={error ? "alert" : "status"}
      aria-labelledby="home-state-title"
    >
      <p className={styles.eyebrow}>{error ? "Service indisponible" : "Contenu à venir"}</p>
      <h1 id="home-state-title">
        {error ? "La maison ne peut pas être affichée pour le moment." : "La Casilla se prépare."}
      </h1>
      <p>
        {error
          ? "Veuillez réessayer dans quelques instants."
          : "Les informations publiques de la maison seront bientôt disponibles."}
      </p>
    </section>
  );
}

export function HomeLoading() {
  return (
    <section className={styles.loadingPanel} aria-busy="true" aria-label="Chargement de la maison">
      <div className={styles.loadingContent}>
        <span className={styles.loadingLine} />
        <span className={styles.loadingTitle} />
        <span className={styles.loadingText} />
        <span className={styles.loadingTextShort} />
      </div>
      <div className={styles.loadingVisual} />
    </section>
  );
}

async function loadHomeData(): Promise<HomeData | null> {
  try {
    return await getHomeData();
  } catch (error) {
    console.error("Impossible de charger les données publiques de l’accueil.", error);
    return null;
  }
}

export async function HomeContent() {
  await connection();
  const data = await loadHomeData();

  if (!data) return <HomeState error />;

  const { property, content, media, reviews } = data;
  if (!property || !content) return <HomeState />;

  const heroMedia = media[0];

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Maison entière · Séjour en toute simplicité</p>
          <h1 id="hero-title">{content.name}</h1>
          <p className={styles.lead}>
            {content.description ?? "Un lieu accueillant pour ralentir et se retrouver."}
          </p>
          <a className={styles.primaryAction} href="#decouvrir">
            Découvrir la maison
          </a>
        </div>
        <div
          className={`${styles.heroVisual} ${heroMedia ? styles.heroVisualMedia : ""}`}
          style={heroBackground(heroMedia)}
          role={heroMedia ? "img" : undefined}
          aria-label={heroMedia?.alt_text}
          aria-hidden={heroMedia ? undefined : true}
        >
          <span>{heroMedia?.caption ?? content.name}</span>
        </div>
      </section>

      <PropertyOverview property={property} content={content} />
      <MediaGallery media={media} />
      <Reviews reviews={reviews} />

      <section className={styles.nextStep} aria-labelledby="next-step-title">
        <p className={styles.eyebrow}>Prochaine étape</p>
        <h2 id="next-step-title">Préparez votre séjour en quelques étapes.</h2>
        <p>
          Les disponibilités, la réservation, le devis et le contact seront ajoutés progressivement.
        </p>
      </section>
    </>
  );
}
