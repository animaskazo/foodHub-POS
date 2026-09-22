import { Helmet } from 'react-helmet-async';

export default function SeoNoIndex() {
  return (
    <Helmet>
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}
