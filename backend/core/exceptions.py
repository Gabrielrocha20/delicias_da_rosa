from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return response
    data = response.data
    if isinstance(data, dict):
        message = data.get('detail') or next(iter(data.values()), None)
        if isinstance(message, list):
            message = message[0] if message else None
        response.data = {'message': str(message or 'Não foi possível concluir esta operação.')}
    return response
