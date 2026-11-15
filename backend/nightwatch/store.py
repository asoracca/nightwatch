from urllib.parse import quote
import httpx
from .settings import settings

class StoreError(Exception):
    def __init__(self, status):
        self.status = status
        super().__init__('Storage or database request failed')

class Store:
    def __init__(self, token=None):
        s = settings()
        key = s.supabase_anon_key if token else s.supabase_service_role_key
        self.base = s.supabase_url.rstrip('/')
        self.headers = {'apikey': key, 'Authorization': 'Bearer ' + (token or key)}

    def request(self, method, path, **kwargs):
        headers = {**self.headers, **kwargs.pop('headers', {})}
        with httpx.Client(timeout=90) as client:
            r = client.request(method, self.base + path, headers=headers, **kwargs)
        if r.is_error:
            raise StoreError(r.status_code)
        if not r.content:
            return None
        return r.json()

    def rows(self, table, **query):
        return self.request('GET', '/rest/v1/' + table, params=query)

    def insert(self, table, data):
        return self.request('POST', '/rest/v1/' + table, json=data, headers={'Prefer':'return=representation'})[0]

    def patch(self, table, row_id, data, **conditions):
        return self.request('PATCH', '/rest/v1/' + table, params={'id':'eq.'+str(row_id), **conditions}, json=data)

    def rpc(self, name, data=None):
        return self.request('POST', '/rest/v1/rpc/' + name, json=data or {})

    def sign_upload(self, path):
        result = self.request('POST', '/storage/v1/object/upload/sign/videos/' + quote(path, safe='/'), json={})
        return self.base + '/storage/v1' + result['url']

    def signed(self, bucket, path):
        r = self.request('POST', '/storage/v1/object/sign/' + bucket + '/' + quote(path, safe='/'), json={'expiresIn':900})
        return self.base + '/storage/v1' + r['signedURL']

    def download(self, path, destination, max_bytes, bucket='videos'):
        with httpx.Client(timeout=120) as client:
            with client.stream('GET', self.base+'/storage/v1/object/'+quote(bucket,safe='')+'/'+quote(path,safe='/'), headers=self.headers) as r:
                if r.is_error:
                    raise StoreError(r.status_code)
                size = 0
                with open(destination,'wb') as f:
                    for chunk in r.iter_bytes():
                        size += len(chunk)
                        if size > max_bytes:
                            raise ValueError('Video exceeds size limit')
                        f.write(chunk)
        return size

    def upsert(self, table, data, on_conflict):
        return self.request('POST', '/rest/v1/' + table, params={'on_conflict': on_conflict}, json=data,
                            headers={'Prefer': 'resolution=merge-duplicates,return=representation'})[0]

    def upload(self, bucket, path, content, content_type, upsert=False):
        return self.request('POST', '/storage/v1/object/'+quote(bucket,safe='')+'/'+quote(path,safe='/'), content=content,
                            headers={'Content-Type':content_type,'x-upsert':'true' if upsert else 'false'})

    def upload_frame(self, path, content):
        return self.request('POST', '/storage/v1/object/frames/'+quote(path,safe='/'), content=content,
                            headers={'Content-Type':'image/jpeg','x-upsert':'false'})
